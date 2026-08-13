// ============================================================================
//  AUTH SERVICE
// ============================================================================
//  All authentication business logic. Deliberately knows NOTHING about HTTP —
//  no req, no res. When the admin panel, a seed script, or a background job
//  needs to create a user, it calls these functions directly.
//
//  REGISTRATION IS TWO-PHASE:
//    Phase 1 (register)  → hold submission in Redis, email a code.
//                          NOTHING is written to `users`.
//    Phase 2 (verifyOtp) → code correct? create the User, already verified,
//                          and open a session.
//
//  The effect: an unverified email address never enters the customer
//  database. For a store that emails order confirmations, delivery updates,
//  and invoices, an unreachable address is a support burden and a lost sale.
// ============================================================================

import { prisma } from "../../lib/prisma";
import {
  hashPassword,
  verifyPassword,
  burnTimingBudget,
} from "../../lib/password";
import {
  createTokenPair,
  hashToken,
  expiresInDays,
  expiresInMinutes,
  expiresInHours,
  PASSWORD_RESET_TTL_HOURS,
} from "../../lib/tokens";
import { generateOtp, hashOtp, verifyOtp as compareOtp } from "../../lib/otp";
import {
  savePending,
  getPending,
  deletePending,
  incrementAttempts,
  getPendingTtl,
} from "../../lib/Pendingstore";
import {
  sendOtpEmail,
  sendAccountExistsEmail,
  sendPasswordResetEmail,
} from "../../lib/Mailer"
import { env } from "../../config/env";
import { badRequest, unauthorized, forbidden, tooManyRequests } from "../../utils/AppError";
import type { RegisterInput, LoginInput } from "./auth.schema";

// ---- Public shapes ----------------------------------------------------------
//  NEVER return the raw Prisma User — it contains passwordHash. Returning it
//  even once leaks the hash into an API response, and from there into browser
//  devtools, server logs, and error trackers.
//
//  This WHITELISTS fields rather than deleting sensitive ones. Whitelisting is
//  safer: a column added to the schema later is not automatically exposed.

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  emailVerified: boolean;
};

function toPublicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: "CUSTOMER" | "ADMIN";
  emailVerifiedAt: Date | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

// ============================================================================
//  PHASE 1 — START REGISTRATION
// ============================================================================

export async function startRegistration(input: RegisterInput): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, firstName: true },
  });

  // ---- Email already registered ---------------------------------------------
  if (existing) {
    // Send a DIFFERENT email, but return the SAME response to the caller.
    //
    // Why: if this threw a "already exists" error, the endpoint would tell an
    // attacker exactly which addresses have accounts — a customer list, and a
    // phishing target list. Responding identically in both cases closes that.
    //
    // The real owner still learns what happened, via their inbox. Someone who
    // does not control the address learns nothing.
    await sendAccountExistsEmail(input.email, existing.firstName).catch((err) => {
      console.error("[auth] account-exists email failed:", err);
    });
    return;
  }

  // ---- Hash the password NOW ------------------------------------------------
  //  Before it goes anywhere near Redis. A plaintext password sitting in a
  //  cache for ten minutes is a plaintext password in your infrastructure.
  const passwordHash = await hashPassword(input.password);

  const otp = generateOtp();

  await savePending({
    email: input.email,
    passwordHash,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone ?? null,
    otpHash: hashOtp(otp),
    attempts: 0,
    createdAt: Date.now(),
  });
  // savePending REPLACES any existing record for this email, so requesting a
  // second code invalidates the first. Otherwise multiple valid codes would
  // accumulate in one inbox, widening the attack surface and confusing the user.

  await sendOtpEmail(input.email, input.firstName, otp);
  // Deliberately NOT wrapped in catch: if the email cannot be sent, the caller
  // must see a failure. Silently succeeding would leave the user waiting for a
  // code that will never arrive.
}

// ============================================================================
//  PHASE 2 — VERIFY OTP AND CREATE THE ACCOUNT
// ============================================================================

export async function verifyOtpAndCreateUser(
  email: string,
  code: string,
  context: { ipAddress?: string; userAgent?: string }
): Promise<{ user: PublicUser; sessionToken: string }> {
  const pending = await getPending(email);

  if (!pending) {
    throw badRequest(
      "This code has expired. Please start again.",
      "PENDING_NOT_FOUND"
    );
    // Covers three cases with one message: never registered, code expired,
    // or attempts exhausted. Distinguishing them would leak whether a
    // registration is in flight for that address.
  }

  // ---- Wrong code -----------------------------------------------------------
  if (!compareOtp(code, pending.otpHash)) {
    const attempts = await incrementAttempts(email);

    if (attempts >= env.OTP_MAX_ATTEMPTS || attempts === -1) {
      await deletePending(email);
      throw tooManyRequests(
        "Too many incorrect attempts. Please start again.",
        "OTP_ATTEMPTS_EXCEEDED"
      );
    }
    // This limit is what makes a 6-digit code viable at all. One million
    // possibilities falls to a script in about a day at 10 guesses/second;
    // capped at five, an attacker's odds are 5 in 1,000,000 per registration.

    const remaining = env.OTP_MAX_ATTEMPTS - attempts;
    throw badRequest(
      `Incorrect code. ${remaining} attempt(s) remaining.`,
      "OTP_INVALID"
    );
  }

  // ---- Correct code — create the account ------------------------------------
  //  Re-check for an existing user. Two registrations for the same address
  //  could both be in flight, or the address could have been registered
  //  through another path since Phase 1. Without this the create throws a raw
  //  Prisma unique-constraint error.
  const alreadyExists = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (alreadyExists) {
    await deletePending(email);
    throw badRequest(
      "An account with this email already exists. Please sign in.",
      "EMAIL_TAKEN"
    );
    // Safe to be specific here: the caller has just proven control of the
    // inbox, so this reveals nothing they could not already discover.
  }

  const { token, tokenHash } = createTokenPair();

  const user = await prisma.user.create({
    data: {
      email: pending.email,
      passwordHash: pending.passwordHash,
      firstName: pending.firstName,
      lastName: pending.lastName,
      phone: pending.phone,
      emailVerifiedAt: new Date(),
      // Verified at creation. The OTP already proved inbox control — there is
      // no second verification step, and the EmailVerificationToken table goes
      // unused by this flow (it remains for future email-CHANGE verification).
      sessions: {
        create: {
          tokenHash,
          expiresAt: expiresInDays(env.SESSION_TTL_DAYS),
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      },
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      emailVerifiedAt: true,
    },
  });
  // Nested create = ONE transaction. Two separate calls risk a user existing
  // with no session if the second fails — registration would appear to hang.

  await deletePending(email);
  // After the user exists, not before. If creation failed, the pending record
  // survives and the user can retry with the same code.

  return { user: toPublicUser(user), sessionToken: token };
  // Session issued immediately: the user just proved inbox control and entered
  // their password moments ago. Forcing a separate login here adds friction
  // with no security gain.
}

// ============================================================================
//  RESEND CODE
// ============================================================================

export async function resendOtp(email: string): Promise<void> {
  const pending = await getPending(email);

  if (!pending) {
    return;
    // Silent no-op. Reporting "no pending registration" would reveal whether
    // an address is mid-signup. The caller always sees the same response.
  }

  const ttl = await getPendingTtl(email);
  if (ttl > (env.OTP_TTL_MINUTES * 60) - 60) {
    throw tooManyRequests(
      "Please wait a moment before requesting another code.",
      "RESEND_TOO_SOON"
    );
    // Minimum 60 seconds between sends. Without this, a script could use your
    // endpoint to flood someone's inbox — which also burns your sending quota
    // and damages domain reputation.
  }

  const otp = generateOtp();

  await savePending({
    ...pending,
    otpHash: hashOtp(otp),
    attempts: 0,
    // Counter resets with the new code. The old code stops working because
    // savePending overwrites the record.
  });

  await sendOtpEmail(email, pending.firstName, otp);
}

// ============================================================================
//  LOGIN
// ============================================================================

export async function loginUser(
  input: LoginInput,
  context: { ipAddress?: string; userAgent?: string }
): Promise<{ user: PublicUser; sessionToken: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // ---- Unknown email --------------------------------------------------------
  if (!user) {
    await burnTimingBudget();
    // Without this the response returns in ~5ms instead of ~400ms, and that
    // 80x gap alone tells an attacker the address is not registered.
    // Measurable over a handful of requests.
    throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  // ---- Locked account -------------------------------------------------------
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw forbidden(
      `Account temporarily locked. Try again in ${minutes} minute(s).`,
      "ACCOUNT_LOCKED"
    );
  }
  // A past timestamp needs no cleanup — the comparison simply fails and the
  // lock is gone. This is why one nullable DateTime beats an isLocked boolean
  // plus an expiry: two fields could contradict each other.

  // ---- Wrong password -------------------------------------------------------
  const valid = await verifyPassword(user.passwordHash, input.password);

  if (!valid) {
    const attempts = user.failedLoginCount + 1;
    const shouldLock = attempts >= env.MAX_FAILED_LOGINS;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? expiresInMinutes(env.LOCKOUT_MINUTES) : null,
      },
    });
    // Counter resets when the lock applies, so the next window starts clean
    // rather than re-locking on a single further mistake.

    throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    // IDENTICAL message, code, and status to the unknown-email case. Any
    // difference turns login into an oracle that enumerates your customers.
  }

  // ---- Success --------------------------------------------------------------
  const { token, tokenHash } = createTokenPair();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    }),
    prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: expiresInDays(env.SESSION_TTL_DAYS),
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    }),
  ]);
  // Transaction: if session creation fails, the lockout reset rolls back too.
  // Otherwise a user could clear their failed-attempt counter with a request
  // that never actually logged them in.

  return { user: toPublicUser(user), sessionToken: token };
}

// ============================================================================
//  SESSION VALIDATION
// ============================================================================
//  Called by requireAuth on EVERY authenticated request. The hottest query in
//  the application — which is why tokenHash carries a unique index.

export async function validateSession(rawToken: string): Promise<{
  user: PublicUser;
  sessionId: string;
} | null> {
  const tokenHash = hashToken(rawToken);
  // Hash the incoming cookie and look up BY HASH. The plaintext is never
  // stored, so a database leak yields nothing usable.

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          emailVerifiedAt: true,
        },
      },
    },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
    // Expiry enforced at READ time. A cleanup job is for disk hygiene only —
    // never rely on it for correctness.
  }

  return { user: toPublicUser(session.user), sessionId: session.id };
}

// ============================================================================
//  LOGOUT
// ============================================================================

export async function logout(sessionId: string): Promise<void> {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  // Deleting an already-gone session is not worth surfacing as an error — the
  // desired end state (no session) is reached either way.
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  // Exactly the capability JWTs cannot provide, and the reason sessions were
  // chosen for this project.
}

// ============================================================================
//  PASSWORD RESET
// ============================================================================

/**
 * Step 1: request a reset link.
 *
 * ⚠️  ALWAYS RESOLVES SUCCESSFULLY, whether or not the account exists.
 *
 * This is the strictest anti-enumeration point in the app. Registration leaks
 * existence by necessity (the user must be told to sign in instead), but here
 * there is no UX cost to silence: someone who does not control the inbox
 * learns nothing either way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, firstName: true, email: true },
  });

  if (!user) {
    await burnTimingBudget();
    // Equalise response time. Without this, a fast return says "no account"
    // and a slow one says "account exists, we sent mail".
    return;
  }

  const { token, tokenHash } = createTokenPair();

  await prisma.$transaction([
    // Invalidate every outstanding reset token for this user first. Otherwise
    // several valid links accumulate in one inbox, each an independent
    // account-takeover credential.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: expiresInHours(PASSWORD_RESET_TTL_HOURS),
      },
    }),
  ]);

  await sendPasswordResetEmail(user.email, user.firstName, token);
  // Only the HASH was stored. The plaintext travels in the email and nowhere
  // else — a database leak yields nothing usable.
}

/**
 * Step 2: consume the token and set a new password.
 */
export async function resetPassword(
  rawToken: string,
  newPassword: string
): Promise<void> {
  const tokenHash = hashToken(rawToken);

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!record || record.expiresAt <= new Date()) {
    throw badRequest(
      "This reset link is invalid or has expired. Please request a new one.",
      "INVALID_RESET_TOKEN"
    );
    // One message for both cases. Distinguishing "wrong token" from "expired
    // token" would confirm that a token existed, which narrows an attacker's
    // search.
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        // Clear any lockout: a successful reset proves inbox control, which is
        // stronger evidence than the failed logins that caused the lock.
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),

    // Single-use, enforced by DELETION rather than a `usedAt` flag. Never
    // leave a live credential in the table after it has served its purpose —
    // an old email on a shared laptop would otherwise still take the account.
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),

    // 🔴 REVOKE EVERY SESSION.
    //
    // The reason to reset a password is usually that someone else has access.
    // Leaving their sessions alive defeats the entire exercise — the attacker
    // stays logged in on their own device while the owner changes a password
    // that no longer matters.
    //
    // This is precisely the capability JWTs cannot provide, and the single
    // clearest justification for choosing sessions on this project.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  // One transaction: a partial failure that changed the password but left
  // sessions alive would be worse than no reset at all.
}