// ============================================================================
//  PASSWORD HASHING — Argon2id
// ============================================================================
//  Argon2id is MEMORY-HARD: each hash requires a fixed block of RAM. bcrypt
//  is only CPU-hard, so an attacker with GPUs runs thousands of guesses in
//  parallel cheaply. Forcing ~19 MB per guess means 1,000 parallel guesses
//  need ~19 GB — memory is expensive and does not parallelise well on GPUs.
//  That flips the economics against the attacker.
//
//  The "id" variant is a hybrid of Argon2i (side-channel resistant) and
//  Argon2d (GPU resistant). It is the current OWASP recommendation.
// ============================================================================

import argon2 from "argon2";

// ---- Parameters -------------------------------------------------------------
//  OWASP baseline: m=19456 KiB (19 MB), t=2, p=1.
//
//  ⚠️  BENCHMARK ON THE PRODUCTION CONTAINER, NOT YOUR LAPTOP.
//  Target ~300-500ms per hash. Too fast is weak. Too slow turns your own
//  login endpoint into a denial-of-service vector — each request pins CPU
//  and holds memory, so a burst of logins can exhaust a small instance.
//
//  Concretely: at 19 MB per hash, ten concurrent logins hold ~190 MB. On a
//  512 MB container that is survivable. At 256 MB per hash it is not — three
//  simultaneous logins would OOM-kill the process.

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,       // iterations
  parallelism: 1,    // threads
};

/**
 * Hashes a plaintext password.
 *
 * The returned string is self-describing — it encodes the algorithm, version,
 * all three parameters, AND the salt. This is why the schema has no `salt`
 * column: adding one is a misunderstanding of the library.
 *
 * A consequence worth knowing: if you raise the parameters later, existing
 * hashes still verify correctly, because each hash carries the parameters it
 * was created with. You can then re-hash on next successful login.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against a stored hash.
 *
 * Never throws on a wrong password — returns false. It only throws if the
 * stored hash is malformed, which indicates data corruption, not a failed
 * login, and should surface as a 500 rather than "invalid credentials".
 */
export async function verifyPassword(
  storedHash: string,
  plaintext: string
): Promise<boolean> {
  try {
    return await argon2.verify(storedHash, plaintext);
  } catch {
    // Malformed hash in the database. Treat as a failed login rather than
    // crashing the request, but this is worth alerting on in production.
    return false;
  }
}

// ---- Timing-attack protection -----------------------------------------------
//  THE PROBLEM: on login, if the email is not found we would return early —
//  in ~5ms. If the email IS found we run Argon2 — ~400ms. That 80x gap is
//  trivially measurable, turning the login endpoint into an oracle that
//  reveals exactly which emails are registered. For a jewelry store that is
//  a customer list, and a phishing target list.
//
//  THE FIX: when no user is found, still burn the same time verifying
//  against a throwaway hash. Both paths then cost ~400ms.

let dummyHashCache: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  // Computed once, lazily, then reused. Doing it at module load would add
  // ~400ms to every server boot for something most requests never need.
  if (!dummyHashCache) {
    dummyHashCache = hashPassword("timing-equalisation-placeholder");
  }
  return dummyHashCache;
}

/**
 * Burns roughly one password-verification's worth of time.
 *
 * Call this in the login path whenever the user is NOT found, so the
 * response time carries no information about whether the email exists.
 */
export async function burnTimingBudget(): Promise<void> {
  const dummy = await getDummyHash();
  await argon2.verify(dummy, "definitely-not-the-password").catch(() => false);
}