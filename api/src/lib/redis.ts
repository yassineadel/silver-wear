// ============================================================================
//  REDIS CLIENT
// ============================================================================
//  Holds EPHEMERAL state only — pending registrations awaiting OTP
//  confirmation. Nothing here is a business record: if Redis were wiped, the
//  worst outcome is that a few people mid-signup must request a new code.
//
//  Nothing durable goes in here. Users, orders, and payments belong in
//  Postgres, where they are backed up and transactional.
//
//  DEPLOYMENT: the same code runs everywhere; only REDIS_URL changes.
//    dev  → redis://localhost:6379
//    prod → rediss://default:xxx@xxx.upstash.io:6379   (note: rediss, TLS)
//  You never deploy your local Redis, exactly as you never deploy a local
//  Postgres — you point at a managed instance instead.
// ============================================================================

import Redis from "ioredis";
import { env, isDevelopment } from "../config/env";

function createRedisClient() {
  const client = new Redis(env.REDIS_URL, {
    // Fail fast rather than queueing commands forever if Redis is unreachable.
    // Without this, a Redis outage makes requests hang instead of erroring —
    // far harder to diagnose, and it ties up connections.
    maxRetriesPerRequest: 3,

    // Exponential-ish backoff, capped. Prevents a reconnect storm when Redis
    // restarts.
    retryStrategy(times) {
      if (times > 10) return null; // give up; the error handler reports it
      return Math.min(times * 200, 3000);
    },

    // Upstash and most managed providers require TLS. ioredis infers this
    // from the rediss:// scheme, so no explicit config is needed — but the
    // connection will fail silently if you use redis:// against a TLS-only
    // host, which is a common deployment mistake.
    lazyConnect: false,
  });

  client.on("error", (err) => {
    // Logged, not thrown. An unhandled 'error' event on an ioredis client
    // crashes the process — and Redis being briefly unavailable should
    // degrade registration, not take down the whole store.
    console.error("[redis] connection error:", err.message);
  });

  client.on("connect", () => {
    if (isDevelopment) console.log("[redis] connected");
  });

  return client;
}

// ---- Hot-reload guard -------------------------------------------------------
//  Same reasoning as lib/prisma.ts: `tsx watch` re-executes modules on every
//  save, and each execution would open another connection. After ~20 saves
//  you hit the connection limit — which on Upstash's free tier is low.

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis = globalForRedis.redis ?? createRedisClient();

if (isDevelopment) {
  globalForRedis.redis = redis;
}

/**
 * Health check. Used by the /health endpoint and on boot to fail loudly if
 * Redis is misconfigured, rather than discovering it on a customer's first
 * registration attempt.
 */
export async function pingRedis(): Promise<boolean> {
  try {
    const reply = await redis.ping();
    return reply === "PONG";
  } catch {
    return false;
  }
}