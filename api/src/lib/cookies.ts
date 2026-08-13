// ============================================================================
//  SESSION COOKIE
// ============================================================================
//  Cookie options live in exactly ONE place. Inlined at each call site, one
//  will eventually differ — and it will be the one that matters.
//
//  A specific, common bug this prevents: res.clearCookie() only works if the
//  options match those used to set it. Set with `path: "/"` and clear
//  without it, and the browser keeps the cookie. The user clicks "log out",
//  sees a success message, and stays logged in.
// ============================================================================

import type { Response } from "express";
import { env, isProduction } from "../config/env";

const COOKIE_NAME = env.SESSION_COOKIE_NAME;

const baseOptions = {
  /// JavaScript cannot read this cookie. An XSS payload can still ACT as the
  /// user while they are on the page, but it cannot EXFILTRATE the token for
  /// later use from the attacker's own machine. This is precisely why tokens
  /// do not go in localStorage — localStorage is fully readable by any script.
  httpOnly: true,

  /// HTTPS only. Disabled in development because localhost is plain HTTP;
  /// with this on in dev, the browser silently drops the cookie and login
  /// appears to succeed while every subsequent request is unauthenticated.
  secure: isProduction,

  /// The browser will not attach this cookie to cross-site POST requests —
  /// the core CSRF defence.
  ///
  /// Why "lax" and not "strict": strict withholds the cookie even on
  /// top-level navigation, so a customer clicking a product link from your
  /// Instagram bio arrives looking logged out. For a store that is a real
  /// conversion loss. Lax allows top-level GET navigation while still
  /// blocking cross-site form posts.
  ///
  /// This works in production because yourbrand.com and api.yourbrand.com
  /// share a registrable domain, making them same-site. Hosting the API on
  /// an unrelated domain would force sameSite: "none", switching off this
  /// protection entirely.
  sameSite: "lax" as const,

  /// Sent to every route on the domain.
  path: "/",
};

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    ...baseOptions,
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000, // ms
  });
  // NOTE: maxAge is a CLIENT-SIDE hint only. The authoritative expiry is
  // Session.expiresAt in the database — a modified browser can keep sending
  // an expired cookie, and the server must reject it regardless.
}

export function clearSessionCookie(res: Response): void {
  // Same options as above, minus maxAge. Any mismatch here and the browser
  // ignores the clear.
  res.clearCookie(COOKIE_NAME, baseOptions);
}

export function readSessionCookie(cookies: Record<string, string> | undefined): string | undefined {
  return cookies?.[COOKIE_NAME];
}