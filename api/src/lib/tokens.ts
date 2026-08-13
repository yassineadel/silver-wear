// ============================================================================
//  TOKEN GENERATION AND HASHING
// ============================================================================
//  Used for session tokens, email verification links, and password resets.
//  All three follow the same pattern:
//
//    1. Generate a cryptographically random secret
//    2. Store SHA-256(secret) in the database
//    3. Send the PLAINTEXT secret to the user (cookie or email link)
//    4. On use: hash the incoming value and look up by hash
//
//  The plaintext never touches the database, and never appears in a log.
// ============================================================================

import { randomBytes, createHash } from "node:crypto";

/// 32 bytes = 256 bits of entropy. Unguessable by brute force for any
/// practical definition of "practical".
const TOKEN_BYTES = 32;

/**
 * Generates a new random token.
 *
 * ⚠️  Uses crypto.randomBytes, NOT Math.random(). Math.random is a
 * predictable PRNG — an attacker who observes a few outputs can compute
 * the internal state and predict every future value. That would let them
 * forge session tokens outright.
 *
 * Encoded base64url (not standard base64) because the result goes into
 * cookies and URLs, where `+`, `/`, and `=` need escaping.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a token for storage.
 *
 * WHY HASH AT ALL: the sessions table is a table of live credentials. If it
 * leaks — SQL injection, a stolen backup, a misconfigured admin panel — an
 * attacker holding plaintext tokens walks into every logged-in account
 * without needing a single password. Hashed, the leak is inert.
 *
 * WHY SHA-256 AND NOT ARGON2: this trips people up. Argon2 is deliberately
 * slow to resist guessing low-entropy, human-chosen passwords. These tokens
 * are 256 bits of randomness — there is nothing to guess. Slow hashing would
 * add hundreds of milliseconds to EVERY authenticated request for zero
 * security benefit. Fast hash is correct here; slow hash is correct for
 * passwords. Different problems, different tools.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Convenience: generate a token and its hash in one step.
 *
 * Returns both because they go to different places — `token` to the user,
 * `tokenHash` to the database. Destructuring at the call site makes it hard
 * to accidentally store the wrong one.
 */
export function createTokenPair(): { token: string; tokenHash: string } {
  const token = generateToken();
  return { token, tokenHash: hashToken(token) };
}

// ---- Expiry helpers ---------------------------------------------------------
//  Centralised so the windows are visible in one place rather than scattered
//  as magic numbers through the service layer.

export function expiresInDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function expiresInHours(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function expiresInMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/// Email verification: 24h. People check email later, and a stolen
/// verification token only confirms an inbox — minor damage.
export const EMAIL_VERIFICATION_TTL_HOURS = 24;

/// Password reset: 1h. This token grants full account takeover, so the
/// window is the exposure. An hour is ample for someone actively resetting.
export const PASSWORD_RESET_TTL_HOURS = 1;