// netlify/functions/_admin_db.js
// Shared Neon DB connection + admin auth helpers

const { Pool } = require("@neondatabase/serverless");
const { createHash, randomBytes } = require("crypto");

// ── DB client (lazy singleton per function cold-start) ────────────────────────
// Uses Pool (not neon()) so all callers can use the .query(sql, params) API.
let _pool = null;
function getDb() {
  if (!_pool) {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) throw new Error("NEON_DATABASE_URL env var is not set.");
    _pool = new Pool({ connectionString: url });
  }
  return _pool;
}

// ── Token helpers ─────────────────────────────────────────────────────────────
function generateToken() {
  // kxu_ + 64 hex chars = 68 chars total
  return "kxu_" + randomBytes(32).toString("hex");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenPrefix(token) {
  // "kxu_abc12345..." — first 12 chars + ellipsis for display
  return token.slice(0, 12) + "...";
}

// ── Auth: Netlify Identity clientContext ──────────────────────────────────────
// Netlify Functions v1: context.clientContext.user is set when request includes
// a valid Netlify Identity JWT as Authorization: Bearer <token>.
// Netlify validates this automatically before populating clientContext.

function requireAdmin(context) {
  const user = context?.clientContext?.user;
  if (!user) return resp(401, { error: "Not authenticated." });
  const roles = user.app_metadata?.roles || [];
  if (!roles.includes("admin")) return resp(403, { error: "Admin role required." });
  return null; // ok
}

// ── Auth: Service secret (worker → Netlify internal calls) ───────────────────
function requireServiceSecret(event) {
  const secret = process.env.KAIXU_SERVICE_SECRET || "";
  if (!secret) return resp(500, { error: "Service secret not configured." });
  const provided = event.headers["x-kaixu-service"] || "";
  if (provided !== secret) return resp(403, { error: "Invalid service secret." });
  return null; // ok
}

// ── Standard JSON response ────────────────────────────────────────────────────
function resp(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-SERVICE",
    },
    body: JSON.stringify(obj),
  };
}

function preflight() {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-SERVICE",
    },
    body: "",
  };
}

module.exports = {
  getDb,
  generateToken,
  hashToken,
  tokenPrefix,
  requireAdmin,
  requireServiceSecret,
  resp,
  preflight,
};
