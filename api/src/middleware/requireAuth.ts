// ============================================================================
//  AUTHENTICATION MIDDLEWARE
// ============================================================================
//  Reads the session cookie, validates it, and attaches the user to the
//  request. Two variants:
//
//    requireAuth   — rejects unauthenticated requests (401)
//    optionalAuth  — attaches the user if present, otherwise continues
//
//  optionalAuth exists for routes that behave differently when signed in but
//  must still work for guests: product pages showing wishlist state, the
//  cart, review lists marking "your review".
// ============================================================================

import type { RequestHandler } from "express";
import { validateSession } from "../modules/auth/auth.service";
import { readSessionCookie, clearSessionCookie } from "../lib/cookies";
import { unauthorized, forbidden } from "../utils/AppError";

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = readSessionCookie(req.cookies);

    if (!token) {
      throw unauthorized("Authentication required", "NOT_AUTHENTICATED");
    }

    const result = await validateSession(token);

    if (!result) {
      clearSessionCookie(res);
      // The cookie is stale — expired, revoked, or forged. Clearing it stops
      // the browser resending a dead token on every subsequent request.
      throw unauthorized("Session expired", "SESSION_EXPIRED");
    }

    req.user = {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
    };
    req.sessionId = result.sessionId;
    // Only the three fields authorisation decisions need. Attaching the whole
    // user object invites controllers to read stale data that was loaded at
    // the start of the request rather than queried fresh.

    next();
  } catch (err) {
    next(err);
  }
};

export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = readSessionCookie(req.cookies);
    if (!token) return next();

    const result = await validateSession(token);
    if (!result) return next();
    // Silent on failure — a guest with a stale cookie should still be able
    // to browse products.

    req.user = {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
    };
    req.sessionId = result.sessionId;

    next();
  } catch {
    next();
    // Even an unexpected error must not break a public page.
  }
};

// ---- Authorisation ----------------------------------------------------------
//  AUTHENTICATION asks "who are you". AUTHORISATION asks "may you do this".
//  Separate middleware, and always in this order — requireAdmin assumes
//  requireAuth has already run.

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    return next(unauthorized("Authentication required", "NOT_AUTHENTICATED"));
  }

  if (req.user.role !== "ADMIN") {
    return next(forbidden("Admin access required", "FORBIDDEN"));
  }
  // 403, not 401. A 401 tells the client to re-authenticate, which loops
  // forever when the real problem is insufficient permission — the user is
  // already correctly signed in.

  next();
};

/**
 * Requires a verified email address.
 *
 * Applied at CHECKOUT, not at login. Blocking login for unverified users is
 * hostile UX — they registered seconds ago and cannot see their own account.
 * Blocking checkout is where an unreachable email actually causes harm:
 * no order confirmation, no delivery updates, no invoice.
 */
export const requireVerifiedEmail: RequestHandler = async (req, _res, next) => {
  if (!req.user) {
    return next(unauthorized("Authentication required", "NOT_AUTHENTICATED"));
  }

  const { prisma } = await import("../lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { emailVerifiedAt: true },
  });

  if (!user?.emailVerifiedAt) {
    return next(
      forbidden("Please verify your email address first", "EMAIL_NOT_VERIFIED")
    );
  }

  next();
};