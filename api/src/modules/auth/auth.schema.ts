// ============================================================================
//  AUTH VALIDATION SCHEMAS
// ============================================================================
//  These do TWO jobs, and the second is easy to overlook:
//
//    1. VALIDATION — reject malformed input before it reaches business logic
//    2. NORMALISATION — transform input into canonical form
//
//  Normalisation lives here, not in route handlers, because five separate
//  places touch email (register, verify, resend, login, password reset).
//  Forget .toLowerCase() in ONE of them and you get an intermittent bug that
//  only affects users who capitalise their address. Declaring it once makes
//  it impossible to skip.
// ============================================================================

import { z } from "zod";

// ---- Disposable domains -----------------------------------------------------
//  Blocks throwaway inboxes. Not a security control — trivially bypassed with
//  any lesser-known service — but it stops the most casual fake signups and
//  protects sender reputation, since these domains bounce heavily.
//
//  A jewelry customer needs a real address: order confirmations, delivery
//  updates, and invoices all depend on it.

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "sharklasers.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mailnesia.com",
]);

// ---- Reusable primitives ----------------------------------------------------

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254) // RFC 5321 limit; also caps abusive payloads
  .refine(
    (value) => !DISPOSABLE_DOMAINS.has(value.split("@")[1] ?? ""),
    "Please use a permanent email address"
  );

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be under 128 characters");
// Length over complexity, following current NIST guidance. Forced symbol
// rules push people toward predictable patterns like "Password1!" and toward
// writing passwords down.
//
// The 128 maximum is a denial-of-service control, not a policy: Argon2 on a
// multi-megabyte string would pin CPU and memory.

const name = z.string().trim().min(1, "Required").max(60);

/// Egyptian mobile: 01, then 0/1/2/5, then 8 digits.
/// Optional at registration, required before checkout — couriers here call
/// ahead of delivery.
const phone = z
  .string()
  .trim()
  .regex(/^01[0125][0-9]{8}$/, "Enter a valid Egyptian mobile number")
  .optional();

/// Exactly six digits. Rejecting the wrong shape before any lookup avoids
/// spending an attempt on input that could never be correct.
const otp = z
  .string()
  .trim()
  .regex(/^[0-9]{6}$/, "Enter the 6-digit code");

// ---- Request schemas --------------------------------------------------------

/// Step 1 of registration. Creates NOTHING in the database — the submission
/// is held in Redis until the code is confirmed.
export const registerSchema = z.object({
  email,
  password,
  firstName: name,
  lastName: name,
  phone,
});

/// Step 2. On success the User row is created, already verified.
export const verifyOtpSchema = z.object({
  email,
  code: otp,
});

export const resendOtpSchema = z.object({
  email,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Deliberately WITHOUT the disposable-domain check. Blocking a login for a
  // domain later added to the blocklist would lock out an existing customer
  // who registered legitimately.
  password: z.string().min(1, "Password is required"),
  // Also deliberately not the strict `password` rule: applying the 8-char
  // minimum here would reject the attempt before checking credentials, which
  // reveals the password policy and breaks any account created under
  // looser rules.
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});

// ---- Inferred types ---------------------------------------------------------
//  Derived from the schemas rather than declared separately, so the runtime
//  validation and the compile-time type can never drift apart.

export type RegisterInput = z.infer<typeof registerSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;