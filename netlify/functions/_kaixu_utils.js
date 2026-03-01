// netlify/functions/_kaixu_utils.js
// Shared helpers for Kaixu Gate Delta (Node 18+ on Netlify)

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

function enforceAuth(event) {
  const openGate = String(process.env.KAIXU_OPEN_GATE || "0") === "1";
  if (openGate) return { ok: true };

  const tokens = csvToSet(process.env.KAIXU_APP_TOKENS);
  const token = pickBearerToken(event);

  if (!tokens.size) {
    return { ok: false, code: 500, message: "Gateway misconfigured: KAIXU_APP_TOKENS is not set." };
  }
  if (!token) {
    return { ok: false, code: 401, message: "Missing app token. Send Authorization: Bearer <token>." };
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
