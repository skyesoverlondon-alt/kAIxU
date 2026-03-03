// netlify/functions/_kaixu_utils.js
// Shared helpers for Kaixu Gate Delta (Node 18+ on Netlify)

const { getDatabaseUrl } = require("./_db_url");

function csvToSet(v) {
  return new Set(
    String(v || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  );
}

function getOrigin(event) {
  return (
    (event.headers && (event.headers.origin || event.headers.Origin)) ||
    ""
  );
}

function corsHeaders(event) {
  const allow = process.env.KAIXU_ALLOWED_ORIGINS;
  const origin = getOrigin(event);

  // If allowlist provided, prefer exact match with specific origin header.
  if (allow && allow.trim()) {
    const set = csvToSet(allow);
    if (set.has(origin)) {
      return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-TOKEN",
        "Access-Control-Max-Age": "86400",
      };
    }
    // Origin not in explicit list — fall back to wildcard.
    // Real security is KAIXU_APP_TOKENS, not CORS.
  }

  // Default: allow all origins (best UX, less locked-down).
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-TOKEN",
    "Access-Control-Max-Age": "86400",
  };
}

function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(obj),
  };
}

function pickBearerToken(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const x = h["x-kaixu-token"] || h["X-KAIXU-TOKEN"] || "";
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  if (x) return String(x).trim();
  return "";
}

// enforceAuth is async — always await it.
// Verification order:
//   1. KAIXU_OPEN_GATE=1 → skip auth (internal/trusted environments only)
//   2. Database URL set → DB-backed check: hash lookup, is_active, expires_at, monthly_limit
//   3. Env-var fallback: KAIXU_APP_TOKENS (comma-separated plaintext). No expiry or quota in this mode.
async function enforceAuth(event) {
  const openGate = String(process.env.KAIXU_OPEN_GATE || "0") === "1";
  if (openGate) return { ok: true };

  const token = pickBearerToken(event);
  if (!token) {
    return { ok: false, code: 401, message: "Missing app token. Send Authorization: Bearer <token>." };
  }

  // ── DB-backed verification (expiry + quota + revocation) ────────────────────
  const dsn = getDatabaseUrl();
  if (dsn) {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const { createHash } = require("crypto");
      const sql = neon(dsn);
      const hash = createHash("sha256").update(token).digest("hex");

      const rows = await sql`
        SELECT id, is_active, expires_at, monthly_limit
        FROM tokens
        WHERE token_hash = ${hash}
        LIMIT 1
      `;

      if (rows.length) {
        const row = rows[0];

        if (!row.is_active) {
          return { ok: false, code: 403, message: "Token has been revoked." };
        }
        if (row.expires_at && new Date(row.expires_at) < new Date()) {
          return { ok: false, code: 403, message: "Token has expired." };
        }

        // ── Monthly quota check ────────────────────────────────────────────────
        if (row.monthly_limit != null) {
          const monthStart = new Date(
            new Date().getFullYear(), new Date().getMonth(), 1
          ).toISOString().slice(0, 10);
          try {
            const usage = await sql`
              SELECT COALESCE(SUM(requests), 0)::int AS cnt
              FROM daily_usage
              WHERE token_id = ${row.id} AND date >= ${monthStart}
            `;
            if ((usage[0]?.cnt ?? 0) >= row.monthly_limit) {
              const nextMonth = new Date(
                new Date().getFullYear(), new Date().getMonth() + 1, 1
              ).toISOString().slice(0, 10);
              return {
                ok: false, code: 429,
                message: `Monthly request quota exceeded. Resets ${nextMonth}.`,
              };
            }
          } catch (quotaErr) {
            // daily_usage may not exist yet — skip quota, don't fail auth
            console.warn("[enforceAuth] quota check skipped:", quotaErr?.message);
          }
        }

        return { ok: true, token, tokenId: row.id };
      }
      // Token not found in DB — fall through to env-var check
    } catch (dbErr) {
      // DB unreachable — fall through to env-var check so a DB outage never kills the gate
      console.warn("[enforceAuth] DB check failed, falling back to env var:", dbErr?.message);
    }
  }

  // ── Env-var fallback (no expiry or quota enforcement in this mode) ──────────
  const tokens = csvToSet(process.env.KAIXU_APP_TOKENS);
  if (!tokens.size) {
    return { ok: false, code: 500, message: "Gateway misconfigured: KAIXU_APP_TOKENS is not set." };
  }
  if (!tokens.has(token)) {
    return { ok: false, code: 403, message: "Invalid app token." };
  }
  return { ok: true, token };
}

function safeJsonParse(str) {
  try { return { ok: true, value: JSON.parse(str) }; }
  catch (e) { return { ok: false, error: e }; }
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

module.exports = {
  csvToSet,
  corsHeaders,
  json,
  enforceAuth,
  safeJsonParse,
  clampInt,
};
