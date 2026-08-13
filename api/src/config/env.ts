// ============================================================================
//  ENVIRONMENT CONFIGURATION
// ============================================================================
//  The ONLY file in the codebase permitted to read `process.env`.
//
//  Why: process.env values are `string | undefined`. Reading them directly
//  scatters untyped, possibly-missing values through the app, and a missing
//  variable surfaces as a confusing runtime crash on the first request that
//  happens to need it — often in production, hours after deploy.
//
//  This module parses everything once at boot and refuses to start if
//  anything is wrong. A misconfigured server should fail loudly at startup,
//  never silently at 2am during a customer's checkout.
// ============================================================================

import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(4000),
  // z.coerce because every env var is a string; this converts "4000" -> 4000.

  /// Pooled connection (Supavisor transaction mode, port 6543).
  /// Used by Prisma Client at runtime.
  DATABASE_URL: z.string().min(1),

  /// Direct/session connection (port 5432). Used by the Prisma CLI for
  /// migrations only. Included here so a missing value fails at boot
  /// rather than mid-migration.
  DIRECT_URL: z.string().min(1),

  /// Exact origin of the React app. Used for the CORS allowlist.
  /// Must be exact — a wildcard is illegal when credentials are enabled.
  FRONTEND_URL: z.string().url(),

  // ---- Session configuration ----------------------------------------------

  SESSION_COOKIE_NAME: z.string().default("sw_session"),

  /// Session lifetime. 30 days balances convenience against exposure —
  /// a stolen device stays logged in for at most this long if never noticed.
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // ---- Lockout policy -----------------------------------------------------
  //  Configurable rather than hardcoded: if the store comes under a
  //  credential-stuffing wave, these can be tightened without a code change.

  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  REDIS_URL: z.string().min(1),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EMAIL_FROM: z.string().min(1).default("Silver Wear <onboarding@resend.dev>"),
  RESEND_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n❌  Invalid environment configuration:\n");
  for (const issue of parsed.error.issues) {
    console.error(`   • ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\n   Check your .env file against .env.example.\n");
  process.exit(1);
  // Hard exit, not a thrown error. A server running with bad config is
  // more dangerous than a server that never started.
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";