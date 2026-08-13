// ============================================================================
//  AUTH RATE LIMITERS
// ============================================================================
//  The global limiter in app.ts allows 300 requests / 15 min — useless
//  against password guessing, where an attacker only needs a handful of
//  well-chosen attempts per account.
//
//  These are the SECOND layer of brute-force defence. The first is the
//  per-account failedLoginCount on the User row. Both are necessary:
//
//    • IP limits stop ONE machine attacking MANY accounts
//    • Account lockout stops MANY machines (a botnet, one attempt each)
//      attacking ONE account
//
//  Neither alone is sufficient.
// ============================================================================

import rateLimit from "express-rate-limit";

const jsonMessage = (message: string) => ({
  error: { code: "RATE_LIMITED", message },
});

/**
 * Login. Tight, because this is the primary credential-stuffing target.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Only FAILED attempts count. A legitimate customer logging in repeatedly
  // across devices is never penalised; only someone guessing wrong is.
  message: jsonMessage("Too many login attempts. Try again in 15 minutes."),
});

/**
 * Registration. Limits automated fake-account creation, which would
 * otherwise pollute the customer list and burn email-sending quota.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many accounts created. Try again later."),
});

/**
 * Password reset requests. Strict for two reasons: each one sends an email
 * (real cost, and a spam-reputation risk if abused), and an attacker could
 * otherwise flood a customer's inbox with reset links to make a phishing
 * email look legitimate among them.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many password reset requests. Try again later."),
});

/**
 * Email verification resend. Same email-cost reasoning.
 */
export const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many requests. Try again later."),
});

// ---- Production note --------------------------------------------------------
//  These stores are IN-MEMORY. They reset on restart and are NOT shared
//  across instances — two containers means an attacker gets double the
//  allowance. Fine for a single container at launch; move to a Redis store
//  before scaling horizontally.


/**
 * OTP verification. The most security-critical limiter here.
 *
 * A 6-digit code has 1,000,000 possibilities. The per-record attempt counter
 * caps guesses at 5 per registration — but an attacker could restart
 * registration repeatedly to get 5 fresh guesses each time. This caps total
 * volume regardless of how many pending records they create.
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: jsonMessage("Too many attempts. Try again in 15 minutes."),
});

/**
 * Resend code. Strict: an attacker could otherwise use this to flood a
 * customer's inbox, making a phishing email easier to disguise among the
 * noise. The service enforces a further 60-second minimum between sends.
 */
export const resendOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 4,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: jsonMessage("Too many requests for a new code. Try again later."),
});