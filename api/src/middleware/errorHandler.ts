// ============================================================================
//  ERROR HANDLER
// ============================================================================
//  The last middleware in the stack. Express identifies an error handler by
//  its FOUR parameters — remove `_next` and Express silently treats this as
//  ordinary middleware and it will never run. The underscore marks it as
//  intentionally unused so the linter stays quiet.
//
//  Core rule: the client learns what it needs to act on, and nothing else.
//  Stack traces, SQL fragments, and file paths are free reconnaissance.
// ============================================================================

import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";
import { isProduction } from "../config/env";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // ---- Validation failures (Zod) -------------------------------------------
  //  Safe to expose: these describe the request the client just sent.
  //  Field-level detail is what lets the UI highlight the right input.
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
        fields: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }

  // ---- Expected application errors -----------------------------------------
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // ---- Prisma known errors -------------------------------------------------
  //  Translate to generic responses. NEVER forward Prisma's message: it can
  //  contain table names, column names, and constraint definitions.
  const prismaCode = (err as { code?: string })?.code;

  if (typeof prismaCode === "string" && prismaCode.startsWith("P")) {
    if (prismaCode === "P2002") {
      // Unique constraint violation.
      return res.status(409).json({
        error: {
          code: "CONFLICT",
          message: "That value is already in use",
        },
      });
    }

    if (prismaCode === "P2025") {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Resource not found" },
      });
    }
  }

  // ---- Everything else is a bug --------------------------------------------
  //  Log the full error server-side; return nothing useful to the client.
  console.error("UNHANDLED ERROR:", {
    method: req.method,
    path: req.path,
    message: (err as Error)?.message,
    stack: (err as Error)?.stack,
  });

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
      // Stack only in development. In production this field is absent entirely.
      ...(isProduction ? {} : { detail: (err as Error)?.message }),
    },
  });
};

// ---- 404 handler ------------------------------------------------------------
//  Mounted after all routes. Without it, unmatched paths return Express's
//  default HTML page, which breaks JSON-expecting clients.

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Cannot ${req.method} ${req.path}`,
    },
  });
};