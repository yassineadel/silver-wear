// ============================================================================
//  EXPRESS APPLICATION
// ============================================================================
//  Builds and exports the app. Does NOT call listen() — that lives in
//  server.ts. The split lets Supertest import the app and run requests
//  against it in-process without binding a port.
//
//  MIDDLEWARE ORDER IS NOT COSMETIC. Express runs these top to bottom.
//  Security headers must precede route handlers; the error handler must be
//  last or it will never catch anything.
// ============================================================================

import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
import rateLimit from "express-rate-limit";

import { env, isProduction } from "../api/src/config/env";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler";
import authRoutes from "./src/modules/auth/auth.routes";

const app = express();

// ---- 1. Trust proxy ---------------------------------------------------------
//  In production the app sits behind a reverse proxy (Railway, Render, Nginx).
//  Without this, req.ip is the PROXY's address, not the client's — which
//  silently breaks IP rate limiting: every request appears to come from one
//  address, so either everyone is blocked or nobody is.
//  Value 1 = trust exactly one hop. Never use `true` in production: it lets a
//  client spoof X-Forwarded-For and evade rate limits entirely.
if (isProduction) {
  app.set("trust proxy", 1);
}

// ---- 2. Security headers ----------------------------------------------------
//  Helmet sets ~15 headers. The notable ones: X-Content-Type-Options (stops
//  MIME sniffing), X-Frame-Options (stops clickjacking), HSTS (forces HTTPS),
//  and it removes X-Powered-By so the stack isn't advertised.
app.use(
  helmet({
    // CSP is disabled here because this server returns JSON only; the policy
    // belongs on the frontend host, which actually serves HTML.
    contentSecurityPolicy: false,

    // Allows the React app on a different origin to load any images or files
    // this API serves.
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// ---- 3. CORS ----------------------------------------------------------------
//  The browser blocks cross-origin requests unless the server opts in.
//
//  CRITICAL: `credentials: true` is what allows the session cookie to travel.
//  Without it, every authenticated request silently arrives logged-out —
//  and there is no error message pointing at the cause.
//
//  The origin MUST be an exact string. Browsers reject `*` whenever
//  credentials are enabled, by design: a wildcard plus cookies would let any
//  site on the internet make authenticated requests as your users.
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  })
);

// ---- 4. Body parsing --------------------------------------------------------
//  The size limit is a denial-of-service control: without it a single request
//  can allocate unbounded memory. 100kb is generous for JSON payloads;
//  file uploads will use a separate multipart route with its own limit.
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// ---- 5. Cookies -------------------------------------------------------------
//  Parses the Cookie header into req.cookies so the auth middleware can read
//  the session token.
app.use(cookieParser());

// ---- 6. Compression ---------------------------------------------------------
//  gzip on responses. Meaningful on product listings, which are large,
//  highly repetitive JSON — typically 70-80% smaller.
app.use(compression());

// ---- 7. Global rate limit ---------------------------------------------------
//  A blunt ceiling against scraping and abuse. Auth routes get their own,
//  far stricter limiter in the auth module — 300/15min would be useless
//  against password guessing.
//
//  NOTE: this is in-memory. It resets on restart and is not shared across
//  instances. Fine for a single container at launch; move to a Redis store
//  when you scale horizontally.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: { code: "RATE_LIMITED", message: "Too many requests" },
    },
  })
);

// ---- 8. Health check --------------------------------------------------------
//  Deployment platforms poll this to decide whether the container is alive.
//  Deliberately above the routes and deliberately minimal — it must not touch
//  the database, or a slow query would make the platform kill a healthy app.
app.get("/health", async (_req, res) => {
  const { pingRedis } = await import("../api/src/lib/redis");
  const redisOk = await pingRedis();

  res.status(redisOk ? 200 : 503).json({
    status: redisOk ? "ok" : "degraded",
    redis: redisOk ? "up" : "down",
    timestamp: new Date().toISOString(),
  });
});

// ---- 9. Routes --------------------------------------------------------------
//  Module routers mount here as they are built:
//    app.use("/api/auth", authRoutes);
app.use("/api/auth", authRoutes);
//    app.use("/api/products", productRoutes);

// ---- 10. 404 ----------------------------------------------------------------
//  After all routes: nothing matched.
app.use(notFoundHandler);

// ---- 11. Error handler ------------------------------------------------------
//  MUST BE LAST. Express only sends errors to handlers registered after the
//  route that threw.
app.use(errorHandler);

export default app;