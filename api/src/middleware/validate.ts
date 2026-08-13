// ============================================================================
//  VALIDATION MIDDLEWARE
// ============================================================================
//  Runs a Zod schema against the request before the controller sees it.
// ============================================================================

import type { RequestHandler } from "express";
import type { ZodType } from "zod";

/**
 * Validates and normalises req.body against a schema.
 *
 * ⚠️  THE CRITICAL LINE IS THE REASSIGNMENT.
 *
 * Zod's .trim() and .toLowerCase() produce a NEW object — they do not mutate
 * the input. Validating without reassigning means the controller still reads
 * the raw body, so "  Ahmed@Gmail.com  " reaches the database unchanged and
 * every normalisation rule silently does nothing.
 *
 * That bug is invisible in testing (most people type lowercase) and surfaces
 * weeks later as duplicate accounts.
 */
export const validateBody =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // Forwarded to errorHandler, which formats ZodError into field-level
      // messages the UI can attach to the right input.
      return next(result.error);
    }

    req.body = result.data; // ← normalised data replaces raw input
    next();
  };

/**
 * Same, for query parameters. Used later for product filters and pagination.
 */
export const validateQuery =
  (schema: ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return next(result.error);
    }

    Object.assign(req.query, result.data);
    // req.query is a getter on newer Express versions and cannot be
    // reassigned directly, so its properties are merged in place instead.
    next();
  };