// ============================================================================
//  AUTH CONTROLLERS
// ============================================================================
//  Deliberately THIN. A controller's only job:
//    1. Pull data off the request
//    2. Call the service
//    3. Shape the response
//
//  No business logic, no database queries, no validation (middleware did it).
//  If one grows past ~15 lines, logic has leaked out of the service.
// ============================================================================

import type { RequestHandler } from "express";
import * as authService from "./auth.service";
import { setSessionCookie, clearSessionCookie } from "../../lib/cookies";
import { env } from "../../config/env";
import { unauthorized } from "../../utils/AppError";

// ---- Phase 1: start registration --------------------------------------------

export const register: RequestHandler = async (req, res, next) => {
  try {
    await authService.startRegistration(req.body);

    res.status(202).json({
      message: "If that email can receive mail, a verification code is on its way.",
      expiresInMinutes: env.OTP_TTL_MINUTES,
    });
    // 202 Accepted, not 201 Created — nothing has been created yet.
    //
    // The message is deliberately non-committal. An identical response is sent
    // whether or not the address already has an account, so this endpoint
    // cannot be used to enumerate the customer list.
  } catch (err) {
    next(err);
    // Async errors MUST be forwarded with next(). An unforwarded rejection
    // leaves the request hanging until timeout — no error, no response, no log.
  }
};

// ---- Phase 2: verify code, create account, log in ---------------------------

export const verifyOtp: RequestHandler = async (req, res, next) => {
  try {
    const { user, sessionToken } = await authService.verifyOtpAndCreateUser(
      req.body.email,
      req.body.code,
      { ipAddress: req.ip, userAgent: req.get("user-agent") }
    );

    setSessionCookie(res, sessionToken);
    // Token goes ONLY into the httpOnly cookie, never the JSON body. Returning
    // it in the body would place it within reach of any script on the page,
    // defeating the point of httpOnly entirely.

    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
};

export const resendOtp: RequestHandler = async (req, res, next) => {
  try {
    await authService.resendOtp(req.body.email);

    res.status(202).json({
      message: "If a registration is pending for that email, a new code has been sent.",
    });
  } catch (err) {
    next(err);
  }
};

// ---- Login ------------------------------------------------------------------

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { user, sessionToken } = await authService.loginUser(req.body, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    setSessionCookie(res, sessionToken);
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// ---- Logout -----------------------------------------------------------------

export const logout: RequestHandler = async (req, res, next) => {
  try {
    if (req.sessionId) {
      await authService.logout(req.sessionId);
    }

    clearSessionCookie(res);
    // Cleared unconditionally, even if no session was found. The user's intent
    // is "log me out" — the end state must be reached regardless.

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const logoutAll: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();

    await authService.logoutAllDevices(req.user.id);
    clearSessionCookie(res);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ---- Current user -----------------------------------------------------------

export const me: RequestHandler = (req, res) => {
  res.json({ user: req.user ?? null });
  // The frontend calls this on page load to restore auth state. Because the
  // token lives in an httpOnly cookie, JavaScript cannot inspect it — asking
  // the server is the only way to know whether the visitor is signed in.
};

// ---- Password reset ---------------------------------------------------------

export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    await authService.requestPasswordReset(req.body.email);

    res.status(202).json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
    // IDENTICAL response whether or not the account exists. Unlike
    // registration, there is no UX cost to silence here — so this endpoint
    // gives away nothing at all.
  } catch (err) {
    next(err);
  }
};

export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.token, req.body.password);

    clearSessionCookie(res);
    // The reset revoked every session server-side, including any this browser
    // held. Clearing the cookie prevents the client resending a dead token.

    res.json({
      message: "Password updated. Please sign in with your new password.",
    });
  } catch (err) {
    next(err);
  }
};