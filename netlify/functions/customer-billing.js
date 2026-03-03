// netlify/functions/customer-billing.js
// POST /api/customer/billing
// Opens the Stripe Customer Portal (cancel, change plan, update payment method, view invoices).
// Returns { url } for the browser to navigate to.

"use strict";

const { requireCustomerSession, json, preflight } = require("./_customer_auth");
const { getDatabaseUrl } = require("./_db_url");

const BASE_URL =
  process.env.PUBLIC_URL || "https://kaixu67.skyesoverlondon.netlify.app";

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(getDatabaseUrl());
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const { customer, error } = await requireCustomerSession(event);
  if (error || !customer) return json(401, { ok: false, error: "Not authenticated" });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return json(503, { ok: false, error: "Billing not configured" });

  const dsn = getDatabaseUrl();
  if (!dsn) return json(500, { ok: false, error: "Database not configured" });

  try {
    const sql = await getDb();
    const rows = await sql`
      SELECT stripe_customer_id
      FROM customers
      WHERE id = ${customer.id}
      LIMIT 1
    `;
    const cust = rows[0];

    if (!cust?.stripe_customer_id) {
      return json(400, {
        ok: false,
        error: "No billing account found. Upgrade to a paid plan first.",
      });
    }

    const Stripe = require("stripe");
    const stripe = Stripe(stripeKey);

    const session = await stripe.billingPortal.sessions.create({
      customer: cust.stripe_customer_id,
      return_url: `${BASE_URL}/portal.html`,
    });

    return json(200, { ok: true, url: session.url });
  } catch (err) {
    console.error("[customer-billing] Stripe error:", err.message);
    return json(500, { ok: false, error: "Failed to open billing portal" });
  }
};
