// ============================================================================
//  EXPRESS TYPE AUGMENTATION
// ============================================================================
//  Adds `req.user` and `req.sessionId` to Express's Request type.
//
//  Without this, the auth middleware attaches a user that TypeScript does not
//  know exists, forcing `(req as any).user` at every protected route — which
//  discards type safety exactly where mistakes are most costly (permission
//  checks, ownership checks).
//
//  This works through DECLARATION MERGING: re-opening an existing interface
//  and adding fields. It requires no import in consuming files — TypeScript
//  picks it up from the project automatically.
//
//  NOTE: both are optional (`?`). They exist only AFTER the auth middleware
//  has run. That optionality is deliberate: it forces a null check on any
//  route where authentication is not guaranteed, so an unprotected route can
//  never silently read `req.user.id` as undefined.
// ============================================================================

import type { Role } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
      };

      /// The current session's row id — needed by logout to revoke this
      /// session specifically, rather than every session the user has.
      sessionId?: string;
    }
  }
}

// An empty export makes this file a module, which is required for `declare
// global` to be valid. Removing it silently breaks the augmentation.
export {};