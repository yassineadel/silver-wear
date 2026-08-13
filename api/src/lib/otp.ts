// ============================================================================
//  ONE-TIME PASSCODE (OTP)
// ============================================================================
//  Six digits, emailed to prove the address exists and is controlled by the
//  person registering.
//
//  A 6-digit code is only 1,000,000 possibilities — weak on its own. Its
//  security comes from THREE constraints working together, and removing any
//  one of them breaks it:
//
//    1. SHORT LIFETIME  (10 minutes)
//    2. ATTEMPT LIMIT   (5 wrong guesses, then the pending record is destroyed)
//    3. RATE LIMITING   (on the endpoint, capping request volume)
//
//  Without (2), an attacker scripting 10 requests/second exhausts the whole
//  keyspace in about a day. With it, they get five tries.
// ============================================================================

import { randomInt, createHash, timingSafeEqual } from "node:crypto";

/**
 * Generates a 6-digit code.
 *
 * ⚠️  randomInt, NOT Math.random. Math.random is a predictable PRNG — an
 * attacker who observes a handful of outputs can recover the internal state
 * and predict every subsequent code. randomInt draws from the OS entropy
 * source.
 *
 * The range starts at 100000 so the result is always exactly six digits;
 * padding a smaller number with leading zeros would shrink the real keyspace.
 */
export function generateOtp(): string {
  return randomInt(100_000, 1_000_000).toString();
}

/**
 * Hashes a code for storage.
 *
 * Even though the record lives only ten minutes, the plaintext code is never
 * stored. A Redis snapshot, a debug dump, or an errant log line would
 * otherwise expose live credentials for every in-flight registration.
 *
 * SHA-256 rather than Argon2: this is not a user-chosen secret being
 * protected from offline cracking — it is a short-lived random value whose
 * defence is the attempt limit, not hash cost. Argon2 here would add ~400ms
 * to every verification for no benefit.
 */
export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/**
 * Compares a submitted code against a stored hash in CONSTANT TIME.
 *
 * ⚠️  Why not just `hashOtp(input) === storedHash`?
 *
 * JavaScript's === on strings short-circuits at the first differing
 * character. Comparing "a1b2..." against "a1c3..." returns marginally faster
 * than comparing against "z9y8...", because it bails at position 2 instead
 * of position 0. Measured across many requests, that leak lets an attacker
 * reconstruct the hash one character at a time.
 *
 * timingSafeEqual always examines every byte, so the duration carries no
 * information about how much of the value matched.
 *
 * This matters less for a 10-minute OTP than for a session token, but the
 * correct comparison costs nothing — so there is no reason to use the
 * incorrect one.
 */
export function verifyOtp(submitted: string, storedHash: string): boolean {
  const submittedHash = hashOtp(submitted);

  const a = Buffer.from(submittedHash, "hex");
  const b = Buffer.from(storedHash, "hex");

  // timingSafeEqual throws on length mismatch, which would itself be a
  // timing signal. Both are SHA-256 hex digests so lengths always match,
  // but the guard prevents a crash on malformed stored data.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}