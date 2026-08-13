// ============================================================================
//  APPLICATION ERROR
// ============================================================================
//  Distinguishes EXPECTED failures ("email already registered", "not found")
//  from BUGS (undefined is not a function, database unreachable).
//
//  Why this matters: expected failures should show the user a helpful message.
//  Bugs must NEVER show their message to the user — stack traces, SQL text,
//  and file paths are reconnaissance for an attacker. The error handler uses
//  `isOperational` to decide which is which.
// ============================================================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code = "ERROR",
    isOperational = true
  ) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // Without this, the stack trace starts inside this constructor instead of
    // at the line that actually threw — making every trace useless.
    Error.captureStackTrace(this, this.constructor);
  }
}

// ---- Shorthand constructors -------------------------------------------------
//  Consistent status codes and machine-readable `code` values across the app.
//  The frontend switches on `code`, never on the human-readable message —
//  messages get reworded and translated; codes are a contract.

export const badRequest = (msg: string, code = "BAD_REQUEST") =>
  new AppError(400, msg, code);

export const unauthorized = (msg = "Authentication required", code = "UNAUTHORIZED") =>
  new AppError(401, msg, code);
// 401 = "we do not know who you are"

export const forbidden = (msg = "You do not have permission", code = "FORBIDDEN") =>
  new AppError(403, msg, code);
// 403 = "we know who you are, and you may not do this"
// Mixing these up is a real bug: a 401 makes the client try to re-authenticate,
// which loops forever when the real problem is insufficient permission.

export const notFound = (msg = "Resource not found", code = "NOT_FOUND") =>
  new AppError(404, msg, code);

export const conflict = (msg: string, code = "CONFLICT") =>
  new AppError(409, msg, code);
// 409 for state conflicts: duplicate email, out-of-stock at checkout.

export const tooManyRequests = (msg = "Too many requests", code = "RATE_LIMITED") =>
  new AppError(429, msg, code);