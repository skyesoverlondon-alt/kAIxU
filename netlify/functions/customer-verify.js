// netlify/functions/customer-verify.js
// GET /api/customer/verify?t=TOKEN
// Validates magic link → upserts customer → creates Stripe customer →
// issues kAIxU Lite API token (2hr TTL, 50 req cap) → sets session cookie → redirects to portal.

"use strict";

const crypto = require("crypto");
const { signSession, sessionCookie, redirect, json } = require("./_customer_auth");

const BASE_URL =
  process.env.PUBLIC_URL || "https://kaixu67.skyesoverlondon.netlify.app";

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.NEON_DATABASE_URL);
}

async function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateApiToken() {
  return "kxu_" + crypto.randomBytes(24).toString("base64url");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const magicToken = String((event.queryStringParameters || {}).t || "");

  if (!magicToken || magicToken.length !== 64) {
    return redirect(`${BASE_URL}/portal.html?error=invalid_link`);
  }

  const dsn = process.env.NEON_DATABASE_URL;
  if (!dsn) return json(500, { ok: false, error: "Database not configured" });

  try {
    const sql = await getDb();

    // ── Look up and validate the magic link ───────────────────────────────
    const links = await sql`
      SELECT id, email, expires_at, used_at
      FROM customer_magic_links
      WHERE token = ${magicToken}
      LIMIT 1
    `;

    if (!links.length) return redirect(`${BASE_URL}/portal.html?error=invalid_link`);

    const link = links[0];

    if (link.used_at) return redirect(`${BASE_URL}/portal.html?error=link_used`);
    if (new Date(link.expires_at) < new Date())
      return redirect(`${BASE_URL}/portal.html?error=link_expired`);

    // Mark used immediately (prevents replay)
    await sql`UPDATE customer_magic_links SET used_at = NOW() WHERE id = ${link.id}`;

    const email = link.email;

    // ── Upsert customer ───────────────────────────────────────────────────
    await sql`
      INSERT INTO customers (email)
      VALUES (${email})
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
    `;

    const customers = await sql`
      SELECT id, email, stripe_customer_id, tier
      FROM customers
      WHERE email = ${email}
      LIMIT 1
    `;
    const customer = customers[0];

    // ── Create Stripe customer (best-effort) ──────────────────────────────
    if (!customer.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const Stripe = require("stripe");
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        const sc = await stripe.customers.create({
          email,
          metadata: { kaixu_customer_id: String(customer.id) },
        });
        await sql`
          UPDATE customers
          SET stripe_customer_id = ${sc.id}
          WHERE id = ${customer.id}
        `;
      } catch (stripeErr) {
        console.warn("[customer-verify] Stripe customer create failed:", stripeErr.message);
      }
    }

    // ── Issue kAIxU Lite token if the customer has no active token ────────
    const existing = await sql`
      SELECT id FROM tokens
      WHERE customer_id = ${customer.id} AND is_active = TRUE
      LIMIT 1
    `;

    if (!existing.length) {
      const rawToken = generateApiToken();
      const hash = await hashToken(rawToken);
      const prefix = rawToken.slice(0, 12);
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2hr

      await sql`
        INSERT INTO tokens
          (label, token_hash, token_prefix, created_by,
           allowed_models, monthly_limit, expires_at, notes, customer_id)
        VALUES (
          ${`kAIxU Lite — ${email}`},
          ${hash},
          ${prefix},
          ${"self-serve"},
          ${["kAIxU-flash"]},
          ${50},
          ${expiresAt},
          ${"Auto-issued kAIxU Lite trial. 2 hr TTL, 50 req/month cap."},
          ${customer.id}
        )
      `;
    }

    // ── Sign session JWT + redirect ───────────────────────────────────────
    const sessionToken = await signSession({
      id: customer.id,
      email,
      tier: customer.tier || "lite",
    });

    return redirect(`${BASE_URL}/portal.html`, {
      "Set-Cookie": sessionCookie(sessionToken),
    });
  } catch (err) {
    console.error("[customer-verify] Error:", err.message);
    return redirect(`${BASE_URL}/portal.html?error=server_error`);
  }
};
