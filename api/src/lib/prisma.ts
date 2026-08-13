// ============================================================================
//  PRISMA CLIENT — SINGLE INSTANCE
// ============================================================================
//  Every PrismaClient opens its own connection pool. Instantiating one per
//  file (or per request) exhausts Postgres connections under load — this is
//  the single most common Prisma mistake in production. Import THIS `prisma`
//  everywhere; never call `new PrismaClient()` anywhere else.
//
//  PRISMA 7 NOTE: the client no longer bundles a Rust query engine. It needs
//  an explicit driver adapter, and `new PrismaClient()` with no arguments is
//  a type error ("Expected 1 argument, but got 0"). Most tutorials online
//  still show the old form.
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env, isDevelopment } from "../config/env";

// Note the pooled URL here (port 6543), not DIRECT_URL. Runtime queries go
// through Supavisor; only migrations use the direct connection.
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
});

function createPrismaClient() {
  return new PrismaClient({
    adapter,
    log: isDevelopment
      ? ["query", "warn", "error"]
      : ["error"],
    // Query logging in development makes N+1 problems obvious immediately.
    // Never enable it in production: it is noisy, slow, and query logs can
    // contain customer data.
  });
}

// ---- Hot-reload guard -------------------------------------------------------
//  `tsx watch` re-executes modules on every file save. Without this guard,
//  each save leaks another client and its pool, and after ~20 saves Supabase
//  starts rejecting connections. Stashing the instance on globalThis (which
//  survives module reloads) keeps exactly one alive.
//  Production runs the module once, so the guard is a no-op there.

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}