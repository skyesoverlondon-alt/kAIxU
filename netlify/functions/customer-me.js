// netlify/functions/customer-me.js
// GET /api/customer/me
// Returns the session'd customer's profile, active tokens and monthly usage.
// 401 if no valid session cookie → portal shows signup form.

"use strict";

const { requireCustomerSession, json, preflight } = require("./_customer_auth");
const { getDatabaseUrl } = require("./_db_url");

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(getDatabaseUrl());
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return json(405, { ok: false, error: "Method not allowed" });

  const { customer, error } = await requireCustomerSession(event);
  if (error || !customer) return json(401, { ok: false, error: error || "Not authenticated" });

  const dsn = getDatabaseUrl();
  if (!dsn) return json(500, { ok: false, error: "Database not configured" });

  try {
    const sql = await getDb();

    const rows = await sql`
      SELECT id, email, stripe_customer_id, stripe_subscription_id, tier, created_at
      FROM customers
      WHERE id = ${customer.id}
      LIMIT 1
    `;
    if (!rows.length) return json(401, { ok: false, error: "Customer not found" });
    const cust = rows[0];

    // Active tokens
    const tokens = await sql`
      SELECT id, token_prefix, label, expires_at, is_active,
             allowed_models, monthly_limit, created_at
      FROM tokens
      WHERE customer_id = ${cust.id}
      ORDER BY created_at DESC
      LIMIT 5
    `;

    // Usage this calendar month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const usageRows = await sql`
      SELECT
        COALESCE(SUM(du.requests), 0)::int      AS requests_this_month,
        COALESCE(SUM(du.total_tokens), 0)::int  AS tokens_this_month
      FROM tokens t
      LEFT JOIN daily_usage du ON du.token_id = t.id AND du.date >= ${monthStart}
      WHERE t.customer_id = ${cust.id}
    `;
    const usage = usageRows[0] || { requests_this_month: 0, tokens_this_month: 0 };

    return json(200, {
      ok: true,
      customer: {
        id: cust.id,
        email: cust.email,
        tier: cust.tier || "lite",
        hasStripe: !!cust.stripe_customer_id,
        hasSubscription: !!cust.stripe_subscription_id,
        createdAt: cust.created_at,
      },
      tokens: tokens.map((t) => ({
        id: t.id,
        prefix: t.token_prefix,
        label: t.label,
        isActive: t.is_active,
        expiresAt: t.expires_at,
        allowedModels: t.allowed_models,
        monthlyLimit: t.monthly_limit,
        createdAt: t.created_at,
      })),
      usage: {
        requestsThisMonth: usage.requests_this_month,
        tokensThisMonth: usage.tokens_this_month,
      },
    });
  } catch (err) {
    console.error("[customer-me] Error:", err.message);
    return json(500, { ok: false, error: "Failed to load profile" });
  }
};
