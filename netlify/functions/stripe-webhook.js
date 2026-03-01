// netlify/functions/stripe-webhook.js
// POST /api/customer/stripe-webhook
// Handles Stripe subscription lifecycle events and syncs state to Neon.
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   (from Stripe dashboard → Webhooks → Signing Secret)
//
// Events handled:
//   checkout.session.completed       — link Stripe customer ID to kAIxU customer
//   customer.subscription.created    — activate subscription, upgrade token limits
//   customer.subscription.updated    — update tier/limits on plan change
//   customer.subscription.deleted    — downgrade to lite, revoke paid tokens
//   invoice.payment_failed           — log warning (3-day grace period via Stripe)
//   invoice.payment_succeeded        — optional: extend token if it was about to expire

"use strict";

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(process.env.NEON_DATABASE_URL);
}

// Monthly request caps per tier. null = unlimited.
const TIER_LIMITS = {
  lite: 50,
  starter: 500,
  pro: 2000,
  enterprise: null,
};

function getTier(priceMetadata = {}) {
  return (priceMetadata.kaixu_tier || "starter").toLowerCase();
}

async function activateSubscription(sql, stripeCustomerId, subscriptionId, tier) {
  const monthlyLimit = Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier)
    ? TIER_LIMITS[tier]
    : 1000;

  await sql`
    UPDATE customers
    SET stripe_subscription_id = ${subscriptionId},
        tier                   = ${tier},
        updated_at             = NOW()
    WHERE stripe_customer_id = ${stripeCustomerId}
  `;

  // Remove expiry + raise monthly limit on all active customer tokens
  await sql`
    UPDATE tokens t
    SET expires_at    = NULL,
        monthly_limit = ${monthlyLimit},
        notes         = ${`Active ${tier} subscription`}
    FROM customers c
    WHERE t.customer_id      = c.id
      AND c.stripe_customer_id = ${stripeCustomerId}
      AND t.is_active          = TRUE
  `;
}

async function deactivateSubscription(sql, stripeCustomerId) {
  await sql`
    UPDATE customers
    SET stripe_subscription_id = NULL,
        tier                   = 'lite',
        updated_at             = NOW()
    WHERE stripe_customer_id = ${stripeCustomerId}
  `;

  // Revoke subscription tokens — customer must re-subscribe to get a fresh one
  await sql`
    UPDATE tokens t
    SET is_active = FALSE
    FROM customers c
    WHERE t.customer_id        = c.id
      AND c.stripe_customer_id = ${stripeCustomerId}
      AND t.is_active          = TRUE
  `;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: {}, body: "Method not allowed" };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error("[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return { statusCode: 500, headers: {}, body: "Webhook not configured" };
  }

  // ── Verify Stripe signature ───────────────────────────────────────────────
  let stripeEvent;
  try {
    const Stripe = require("stripe");
    const stripe = Stripe(stripeKey);
    const sig =
      event.headers["stripe-signature"] ||
      event.headers["Stripe-Signature"] ||
      "";
    // event.body must be the raw string (Netlify passes it as-is)
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return { statusCode: 400, headers: {}, body: `Webhook signature error: ${err.message}` };
  }

  const dsn = process.env.NEON_DATABASE_URL;
  if (!dsn) return { statusCode: 500, headers: {}, body: "DB not configured" };

  try {
    const sql = await getDb();
    const { type, data } = stripeEvent;
    const obj = data.object;

    console.log(`[stripe-webhook] ${type} — ${obj.id}`);

    switch (type) {
      // ── Subscription created / updated ──────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const activeStatuses = ["active", "trialing"];
        const deadStatuses = ["canceled", "unpaid", "incomplete_expired"];

        if (activeStatuses.includes(obj.status)) {
          const priceItem = obj.items?.data?.[0];
          const tier = getTier(priceItem?.price?.metadata);
          await activateSubscription(sql, obj.customer, obj.id, tier);
          console.log(`[stripe-webhook] Activated ${tier} for ${obj.customer}`);
        } else if (deadStatuses.includes(obj.status)) {
          await deactivateSubscription(sql, obj.customer);
          console.log(`[stripe-webhook] Deactivated ${obj.customer} (status: ${obj.status})`);
        }
        break;
      }

      // ── Subscription cancelled ───────────────────────────────────────────
      case "customer.subscription.deleted": {
        await deactivateSubscription(sql, obj.customer);
        console.log(`[stripe-webhook] Subscription deleted for ${obj.customer}`);
        break;
      }

      // ── Checkout completed — link Stripe customer to kAIxU customer ──────
      case "checkout.session.completed": {
        if (obj.mode === "subscription" && obj.customer) {
          const kaixuId = obj.metadata?.kaixu_customer_id;
          if (kaixuId) {
            await sql`
              UPDATE customers
              SET stripe_customer_id = ${obj.customer}
              WHERE id = ${Number(kaixuId)}
                AND stripe_customer_id IS NULL
            `;
          }
        }
        break;
      }

      // ── Payment failed — log, don't revoke yet (Stripe handles grace) ────
      case "invoice.payment_failed": {
        console.warn(`[stripe-webhook] Payment failed for ${obj.customer}. Invoice: ${obj.id}`);
        await sql`
          INSERT INTO system_events (event_type, actor, target, details)
          VALUES (
            'payment_failed',
            'stripe-webhook',
            ${String(obj.customer)},
            ${JSON.stringify({ invoiceId: obj.id, amountDue: obj.amount_due, currency: obj.currency })}
          )
        `;
        break;
      }

      // ── Payment succeeded — clean state ──────────────────────────────────
      case "invoice.payment_succeeded": {
        if (obj.billing_reason === "subscription_cycle") {
          // Subscription renewed — ensure token is still active (no-op if already is)
          console.log(`[stripe-webhook] Subscription renewal payment for ${obj.customer}`);
        }
        break;
      }

      default:
        // Silently ignore unhandled events
        break;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ received: true }),
    };
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err.message, err.stack);
    return { statusCode: 500, headers: {}, body: "Internal error" };
  }
};
