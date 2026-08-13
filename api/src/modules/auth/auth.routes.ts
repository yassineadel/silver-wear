// ============================================================================
//  AUTH ROUTES
// ============================================================================
//  Wiring only — no logic. Each line reads as a pipeline:
//
//      path → rate limiter → validation → auth check → controller
//
//  ORDER MATTERS. The rate limiter comes FIRST: putting validation ahead of it
//  means an attacker's malformed floods still cost you CPU parsing before
//  anything rejects them.
// ============================================================================

import { Router } from "express";
import * as controller from "./auth.controller";
import { validateBody } from "../../middleware/validate";
import { requireAuth } from "../../middleware/requireAuth";
import {
  loginLimiter,
  registerLimiter,
  otpVerifyLimiter,
  resendOtpLimiter,
  passwordResetLimiter,
} from "../../middleware/rateLimiters";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schema";

const router = Router();

// ---- Registration (two phases) ----------------------------------------------

/// Phase 1. Writes NOTHING to the database — holds the submission in Redis
/// and emails a code. Always returns the same response, so it cannot be used
/// to discover which addresses have accounts.
router.post(
  "/register",
  registerLimiter,
  validateBody(registerSchema),
  controller.register
);

/// Phase 2. Correct code creates the User (already verified) and opens a
/// session in one transaction.
router.post(
  "/verify-otp",
  otpVerifyLimiter,
  validateBody(verifyOtpSchema),
  controller.verifyOtp
);

router.post(
  "/resend-otp",
  resendOtpLimiter,
  validateBody(resendOtpSchema),
  controller.resendOtp
);

// ---- Login ------------------------------------------------------------------

router.post("/login", loginLimiter, validateBody(loginSchema), controller.login);

// ---- Password reset ---------------------------------------------------------

router.post(
  "/forgot-password",
  passwordResetLimiter,
  validateBody(forgotPasswordSchema),
  controller.forgotPassword
);

router.post(
  "/reset-password",
  passwordResetLimiter,
  validateBody(resetPasswordSchema),
  controller.resetPassword
);

// ---- Authenticated ----------------------------------------------------------

router.get("/me", requireAuth, controller.me);

router.post("/logout", requireAuth, controller.logout);

router.post("/logout-all", requireAuth, controller.logoutAll);
// Separate from /logout on purpose. "Sign out everywhere" is a security action
// taken after losing a device — it must not be conflated with an ordinary
// sign-out on the current browser.

export default router;