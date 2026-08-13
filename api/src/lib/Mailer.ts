// ============================================================================
//  MAILER
// ============================================================================
//  Sends transactional email. Provider-agnostic by design: the rest of the
//  app calls sendOtpEmail() and never learns which service delivers it.
//
//  DEVELOPMENT FALLBACK: when RESEND_API_KEY is empty, messages are printed
//  to the server console instead of sent. This lets the entire OTP flow be
//  built and tested before a domain exists — which matters here, because
//  with OTP-first registration a broken mailer means NOBODY can sign up.
// ============================================================================

import { env, isProduction } from "../config/env";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

// ---- Console transport (development) ----------------------------------------

async function sendToConsole({ to, subject, text }: SendArgs): Promise<void> {
  console.log(
    "\n" +
      "┌─────────────────────────────────────────────────────\n" +
      `│  EMAIL (not sent — no RESEND_API_KEY configured)\n` +
      `│  To:      ${to}\n` +
      `│  Subject: ${subject}\n` +
      "├─────────────────────────────────────────────────────\n" +
      text
        .trim()
        .split("\n")
        .map((l) => `│  ${l}`)
        .join("\n") +
      "\n└─────────────────────────────────────────────────────\n"
  );
}

// ---- Resend transport (production) ------------------------------------------

async function sendViaResend(args: SendArgs): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      // Both html and text are sent. Text-only clients and spam filters both
      // penalise HTML-only mail, and deliverability is the whole game here.
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend failed (${response.status}): ${detail}`);
  }
}

// ---- Dispatcher -------------------------------------------------------------

async function send(args: SendArgs): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (isProduction) {
      // Refuse to silently swallow mail in production. Without this, a
      // missing key would mean every customer registers and never receives
      // a code — with no error anywhere to explain it.
      throw new Error("RESEND_API_KEY is required in production");
    }
    return sendToConsole(args);
  }

  return sendViaResend(args);
}

// ============================================================================
//  TEMPLATES
// ============================================================================

export async function sendOtpEmail(
  to: string,
  firstName: string,
  otp: string
): Promise<void> {
  const minutes = env.OTP_TTL_MINUTES;

  const text = `
Hi ${firstName},

Your Silver Wear verification code is:

    ${otp}

This code expires in ${minutes} minutes.

If you did not request this, you can safely ignore this email.
`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#faf9f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:40px 32px;">
      <p style="margin:0 0 24px;font-size:15px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 24px;font-size:15px;">Your verification code is:</p>
      <div style="font-size:34px;font-weight:600;letter-spacing:10px;text-align:center;padding:20px;background:#faf9f7;border-radius:8px;margin:0 0 24px;">
        ${otp}
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#6b6b6b;">
        This code expires in ${minutes} minutes.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6b6b;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </body>
</html>`;

  await send({
    to,
    subject: `${otp} is your Silver Wear verification code`,
    // Code in the subject line: mobile clients preview it, so many users
    // never open the message. Small detail, measurable conversion effect.
    html,
    text,
  });
}

/**
 * Sent when someone attempts to register with an email that already has an
 * account.
 *
 * This is what allows /register to return an IDENTICAL response in both
 * cases. Without it, a different response would tell an attacker exactly
 * which addresses are registered — turning the endpoint into a customer-list
 * oracle and a phishing target list.
 */
export async function sendAccountExistsEmail(
  to: string,
  firstName: string
): Promise<void> {
  const text = `
Hi ${firstName},

Someone tried to create a Silver Wear account with this email address,
but an account already exists.

If this was you, sign in instead — or reset your password if you've
forgotten it.

If it wasn't you, no action is needed. Your account is unchanged.
`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#faf9f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:40px 32px;">
      <p style="margin:0 0 20px;font-size:15px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 20px;font-size:15px;">
        Someone tried to create an account with this email address, but one already exists.
      </p>
      <p style="margin:0 0 20px;font-size:15px;">
        If this was you, sign in instead — or reset your password if you've forgotten it.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6b6b;">
        If it wasn't you, no action is needed. Your account is unchanged.
      </p>
    </div>
  </body>
</html>`;

  await send({
    to,
    subject: "About your Silver Wear account",
    html,
    text,
  });
}

// ---- Utility ----------------------------------------------------------------

/**
 * Escapes user-supplied values before interpolating into HTML.
 *
 * A name like `<script>` would otherwise be injected into the email body.
 * Email clients are inconsistent about executing script, but the same
 * pattern in any other HTML context is a straightforward XSS — so it is
 * escaped unconditionally rather than reasoned about case by case.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Password reset link.
 *
 * The link points at the FRONTEND, not the API. The React app reads the token
 * from the query string, collects the new password, and POSTs both to the API.
 * A link straight to the API would have to render HTML — which this server
 * does not do — and would leak the token into browser history on a page the
 * user might share.
 */
export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  token: string
): Promise<void> {
  const link = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;

  const text = `
Hi ${firstName},

Someone requested a password reset for your Silver Wear account.

Open this link to choose a new password:

${link}

This link expires in 1 hour and can only be used once.

If you didn't request this, ignore this email — your password is unchanged.
`;

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#faf9f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:40px 32px;">
      <p style="margin:0 0 20px;font-size:15px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 24px;font-size:15px;">
        Someone requested a password reset for your account.
      </p>
      <a href="${link}"
         style="display:inline-block;padding:14px 28px;background:#1a1a1a;color:#ffffff;
                text-decoration:none;border-radius:8px;font-size:15px;font-weight:500;">
        Choose a new password
      </a>
      <p style="margin:28px 0 8px;font-size:13px;color:#6b6b6b;">
        This link expires in 1 hour and can only be used once.
      </p>
      <p style="margin:0;font-size:13px;color:#6b6b6b;">
        If you didn't request this, ignore this email — your password is unchanged.
      </p>
    </div>
  </body>
</html>`;

  await send({
    to,
    subject: "Reset your Silver Wear password",
    html,
    text,
  });
}