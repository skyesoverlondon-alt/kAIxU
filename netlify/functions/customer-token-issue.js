"use strict";

const crypto = require("crypto");
const { requireCustomerSession, json, preflight } = require("./_customer_auth");
const { getDatabaseUrl } = require("./_db_url");

async function getDb() {
  const { neon } = await import("@neondatabase/serverless");
  return neon(getDatabaseUrl());
}

function generateApiToken() {
  return "kxu_" + crypto.randomBytes(24).toString("base64url");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function tokenPrefix(raw) {
  return raw.slice(0, 12) + "...";
}

function tierPolicy(tier) {
  const normalized = String(tier || "lite").toLowerCase();
  if (normalized === "enterprise") {
    return { allowedModels: null, monthlyLimit: null, expiresHours: null };
  }
  if (normalized === "pro") {
    return {
      allowedModels: ["kAIxU6.7-flash", "kAIxU6.7-pro", "kAIxU-flash", "kAIxU-pro"],
      monthlyLimit: 2000,
      expiresHours: null,
    };
  }
  if (normalized === "starter") {
    return {
      allowedModels: ["kAIxU6.7-flash", "kAIxU-flash"],
      monthlyLimit: 500,
      expiresHours: null,
    };
  }
  return {
    allowedModels: ["kAIxU6.7-flash", "kAIxU-flash"],
    monthlyLimit: 50,
    expiresHours: 2,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const { customer, error } = await requireCustomerSession(event);
  if (error || !customer) return json(401, { ok: false, error: error || "Not authenticated" });

  const dsn = getDatabaseUrl();
  if (!dsn) return json(500, { ok: false, error: "Database not configured" });

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const rotateExisting = body.rotateExisting === true;

  try {
    const sql = await getDb();

    const rows = await sql`
      SELECT id, email, tier
      FROM customers
      WHERE id = ${customer.id}
      LIMIT 1
    `;
    if (!rows.length) return json(404, { ok: false, error: "Customer not found" });
    const cust = rows[0];

    if (rotateExisting) {
      await sql`
        UPDATE tokens
        SET is_active = FALSE
        WHERE customer_id = ${cust.id} AND is_active = TRUE
      `;
    }

    const activeRows = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM tokens
      WHERE customer_id = ${cust.id} AND is_active = TRUE
    `;
    if ((activeRows[0]?.cnt || 0) >= 5) {
      return json(429, {
        ok: false,
        error: "Active token limit reached (5). Rotate or revoke an existing token first.",
      });
    }

    const policy = tierPolicy(cust.tier);
    const rawToken = generateApiToken();
    const hashed = hashToken(rawToken);
    const prefix = tokenPrefix(rawToken);
    const expiresAt = policy.expiresHours
      ? new Date(Date.now() + policy.expiresHours * 60 * 60 * 1000).toISOString()
      : null;

    const insert = await sql`
      INSERT INTO tokens
        (label, token_hash, token_prefix, created_by,
         allowed_models, monthly_limit, expires_at, notes, customer_id)
      VALUES (
        ${`Self-serve ${cust.tier || "lite"} token — ${cust.email}`},
        ${hashed},
        ${prefix},
        ${"self-serve"},
        ${policy.allowedModels},
        ${policy.monthlyLimit},
        ${expiresAt},
        ${"Issued via /api/customer/token/issue"},
        ${cust.id}
      )
      RETURNING id, created_at
    `;

    return json(201, {
      ok: true,
      token: rawToken,
      tokenPrefix: prefix,
      tokenId: insert[0].id,
      tier: cust.tier || "lite",
      expiresAt,
      monthlyLimit: policy.monthlyLimit,
      allowedModels: policy.allowedModels,
      warning: "Store this token now. It is shown once and cannot be recovered.",
    });
  } catch (err) {
    console.error("[customer-token-issue] Error:", err.message);
    return json(500, { ok: false, error: "Failed to issue token" });
  }
};
