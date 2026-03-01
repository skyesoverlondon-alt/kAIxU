// netlify/functions/customer-checkout.js
// POST /api/customer/checkout
// Body: { priceId? }  (defaults to STRIPE_LITE_PRICE_ID env var)
// Creates a Stripe Checkout session and returns { url } for the browser to navigate to.

"use strict";

const { requireCustomerSession, json, preflight } = require("./_customer_auth");

const BASE_URL =
  process.env.PUBLIC_URL || "https://kaixu67.skyesoverlondon.netlify.app";

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.NEON_DATABASE_URL);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const { customer, error } = await requireCustomerSession(event);
  if (error || !customer) return json(401, { ok: false, error: "Not authenticated" });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return json(503, { ok: false, error: "Billing not configured" });

  let requestedPriceId;
  try {
    const body = JSON.parse(event.body || "{}");
    requestedPriceId = body.priceId || null;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const priceId =
    requestedPriceId ||
    process.env.STRIPE_LITE_PRICE_ID;

  if (!priceId) {
    return json(503, { ok: false, error: "No price configured. Set STRIPE_LITE_PRICE_ID in Netlify env." });
  }

  const dsn = process.env.NEON_DATABASE_URL;
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

    const Stripe = require("stripe");
    const stripe = Stripe(stripeKey);

    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${BASE_URL}/portal.html?upgraded=1`,
      cancel_url: `${BASE_URL}/portal.html?checkout=cancelled`,
      metadata: { kaixu_customer_id: String(customer.id) },
      allow_promotion_codes: true,
    };

    if (cust?.stripe_customer_id) {
      sessionParams.customer = cust.stripe_customer_id;
    } else {
      sessionParams.customer_email = customer.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return json(200, { ok: true, url: session.url });
  } catch (err) {
    console.error("[customer-checkout] Stripe error:", err.message);
    return json(500, { ok: false, error: "Failed to create checkout session" });
  }
};
