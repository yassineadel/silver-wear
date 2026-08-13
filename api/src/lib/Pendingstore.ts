// ============================================================================
//  PENDING REGISTRATION STORE
// ============================================================================
//  Holds a registration between "submitted the form" and "entered the code".
//  Nothing is written to the `users` table until the OTP is confirmed, so an
//  unverified address never enters the customer database.
//
//  WHY AN ABSTRACTION RATHER THAN CALLING REDIS DIRECTLY:
//  The auth service should not know where this lives. Swapping to Postgres,
//  or adding a fallback if Redis is unavailable, then touches only this file.
//  The four exported functions are the entire contract.
//
//  WHY REDIS SUITS THIS PARTICULAR DATA:
//  It is genuinely ephemeral — no history value, no reporting value, never
//  queried after use. Redis expiry is native (EX on write), so there is no
//  expiresAt column to check and no cleanup job to run.
// ============================================================================

import { redis } from "./redis";
import { env } from "../config/env";

export type PendingRegistration = {
  email: string;
  /// Argon2 hash, computed BEFORE storing. A plaintext password sitting in
  /// Redis for ten minutes is a plaintext password in your infrastructure.
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  /// SHA-256 of the 6-digit code.
  otpHash: string;
  /// Wrong-guess counter. At OTP_MAX_ATTEMPTS the record is destroyed and
  /// the user must restart — this is what makes a 6-digit code viable.
  attempts: number;
  createdAt: number;
};

/// Namespaced key. Prefixing prevents collisions when other features start
/// using the same Redis instance (rate limits, cache, sessions).
const key = (email: string) => `pending:reg:${email}`;

const TTL_SECONDS = env.OTP_TTL_MINUTES * 60;

/**
 * Stores a pending registration, replacing any existing one for this email.
 *
 * Replacement is deliberate: if someone requests a second code, the first
 * must stop working. Otherwise multiple valid codes accumulate in an inbox,
 * widening the attack surface and confusing the user.
 */
export async function savePending(data: PendingRegistration): Promise<void> {
  await redis.set(
    key(data.email),
    JSON.stringify(data),
    "EX",
    TTL_SECONDS
  );
  // "EX" sets expiry in seconds atomically with the write. Setting the value
  // and the TTL as two commands risks a key that never expires if the second
  // fails — a permanent record of a password hash.
}

export async function getPending(
  email: string
): Promise<PendingRegistration | null> {
  const raw = await redis.get(key(email));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingRegistration;
  } catch {
    // Corrupted value — treat as absent and clear it rather than throwing.
    await redis.del(key(email));
    return null;
  }
}

export async function deletePending(email: string): Promise<void> {
  await redis.del(key(email));
}

/**
 * Increments the wrong-guess counter and returns the new total.
 *
 * ⚠️  PRESERVES THE ORIGINAL TTL.
 *
 * A plain `set` would reset the ten-minute window on every wrong guess,
 * letting an attacker keep a record alive indefinitely by guessing
 * periodically. Reading the remaining TTL and reapplying it keeps the
 * original deadline intact.
 */
export async function incrementAttempts(email: string): Promise<number> {
  const k = key(email);
  const raw = await redis.get(k);
  if (!raw) return -1; // record already gone (expired or consumed)

  const remainingTtl = await redis.ttl(k);
  if (remainingTtl <= 0) {
    await redis.del(k);
    return -1;
  }

  const data = JSON.parse(raw) as PendingRegistration;
  data.attempts += 1;

  await redis.set(k, JSON.stringify(data), "EX", remainingTtl);

  return data.attempts;
}

/**
 * Seconds until the pending record expires. Used to tell the user how long
 * their code remains valid.
 */
export async function getPendingTtl(email: string): Promise<number> {
  const ttl = await redis.ttl(key(email));
  return ttl > 0 ? ttl : 0;
}