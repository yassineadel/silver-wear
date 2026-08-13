// ============================================================================
//  SERVER ENTRY POINT
// ============================================================================
//  Starts the HTTP listener and handles shutdown. Separated from app.ts so
//  tests can import the app without binding a port.
// ============================================================================

import app from "../App";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";

const server = app.listen(env.PORT, () => {
  console.log(`\n  API running at http://localhost:${env.PORT}`);
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log(`  CORS origin: ${env.FRONTEND_URL}\n`);
});

// ---- Graceful shutdown ------------------------------------------------------
//  Deployment platforms send SIGTERM before killing a container. Without
//  handling it, in-flight requests are severed mid-response — a customer
//  could be dropped mid-checkout, or a payment webhook lost.
//
//  Correct sequence: stop accepting NEW connections, let in-flight requests
//  finish, then close the database pool.

async function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);

  server.close(async () => {
    // This callback fires once all in-flight requests have completed.
    await prisma.$disconnect();
    console.log("Closed cleanly.");
    process.exit(0);
  });

  // Safety net: if requests hang, force exit rather than block the deploy
  // indefinitely. Most platforms SIGKILL after ~30s anyway.
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT")); // Ctrl+C locally

// ---- Last-resort handlers ---------------------------------------------------
//  An unhandled rejection or uncaught exception leaves the process in an
//  unknown state. Log it and exit — a restarted process is safer than one
//  running on corrupted state. The platform will restart the container.

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});