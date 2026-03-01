// netlify/functions/customer-signup.js
// POST /api/customer/signup
// Body: { email }
// Creates a 15-minute magic link and emails it via Resend.
// If RESEND_API_KEY is not set, logs the link to the function console (dev mode).

"use strict";

const { generateMagicToken, json, preflight } = require("./_customer_auth");

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.NEON_DATABASE_URL);
}

async function sendMagicLinkEmail(email, link) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "kAIxU <noreply@kaixu.ai>";

  if (!apiKey) {
    // Dev mode — safe to log because no real email is sent
    console.log(`[customer-signup] ⚠ RESEND_API_KEY not set. Magic link for ${email}:\n  ${link}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: "Sign in to kAIxU",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#0ea5e9">kAIxU</h2>
          <p>Click the button below to sign in. This link expires in <strong>15 minutes</strong>.</p>
          <a href="${link}"
             style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#fff;
                    text-decoration:none;border-radius:6px;font-weight:bold;margin:16px 0">
            Sign in to kAIxU →
          </a>
          <p style="color:#888;font-size:12px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[customer-signup] Resend error:", res.status, body);
    throw new Error("Email delivery failed");
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  let email;
  try {
    const body = JSON.parse(event.body || "{}");
    email = String(body.email || "")
      .toLowerCase()
      .trim();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, error: "A valid email address is required." });
  }

  const dsn = process.env.NEON_DATABASE_URL;
  if (!dsn) return json(500, { ok: false, error: "Database not configured" });

  try {
    const sql = await getDb();
    const token = generateMagicToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Rate-limit: max 3 unused links per email in last 10 minutes
    const recent = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM customer_magic_links
      WHERE email = ${email}
        AND used_at IS NULL
        AND created_at > NOW() - INTERVAL '10 minutes'
    `;
    if (recent[0].cnt >= 3) {
      return json(429, { ok: false, error: "Too many sign-in attempts. Please wait a few minutes." });
    }

    await sql`
      INSERT INTO customer_magic_links (email, token, expires_at)
      VALUES (${email}, ${token}, ${expiresAt})
    `;

    const baseUrl =
      process.env.PUBLIC_URL || "https://kaixu67.skyesoverlondon.netlify.app";
    const link = `${baseUrl}/api/customer/verify?t=${token}`;

    await sendMagicLinkEmail(email, link);

    return json(200, {
      ok: true,
      message: "Check your email — a sign-in link is on its way.",
    });
  } catch (err) {
    console.error("[customer-signup] Error:", err.message);
    return json(500, { ok: false, error: "Failed to send sign-in link. Please try again." });
  }
};
