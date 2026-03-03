// admin-token-verify.js
// Called by the Cloudflare Worker to validate an app token.
// Auth: KAIXU_SERVICE_SECRETS or KAIXU_SERVICE_SECRET (x-kaixu-service header) — NOT Netlify Identity.
// POST /api/admin/token/verify
// Body: { "token": "kxu_..." }
// Returns: { valid: bool, tokenId, tokenPrefix, allowedModels, monthlyLimit }

const { getDb, hashToken, requireServiceSecret, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  const authErr = requireServiceSecret(event);
  if (authErr) return authErr;

  let token;
  try {
    ({ token } = JSON.parse(event.body || "{}"));
  } catch {
    return resp(400, { error: "Invalid JSON" });
  }

  if (!token || typeof token !== "string") {
    return resp(400, { error: "token required" });
  }

  const db = getDb();
  const hash = await hashToken(token);

  try {
    const { rows } = await db.query(
      `SELECT id, label, token_prefix, allowed_models, monthly_limit, expires_at, is_active
         FROM tokens
        WHERE token_hash = $1
        LIMIT 1`,
      [hash]
    );

    if (!rows.length) {
      return resp(200, { valid: false });
    }

    const row = rows[0];

    if (!row.is_active) {
      return resp(200, { valid: false, reason: "revoked" });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return resp(200, { valid: false, reason: "expired" });
    }

    // ── Monthly quota enforcement ─────────────────────────────────────────────
    // Wrapped in its own try/catch — if daily_usage table doesn't exist yet
    // or has any DB error, we skip the quota check rather than killing auth.
    if (row.monthly_limit != null) {
      try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const { rows: usageRows } = await db.query(
          `SELECT COALESCE(SUM(requests), 0)::int AS month_requests
             FROM daily_usage
            WHERE token_id = $1 AND date >= $2`,
          [row.id, monthStart]
        );
        const monthRequests = usageRows[0]?.month_requests ?? 0;
        if (monthRequests >= row.monthly_limit) {
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return resp(200, {
            valid: false,
            reason: "quota_exceeded",
            resetDate: nextMonth.toISOString().slice(0, 10),
            monthlyLimit: row.monthly_limit,
            monthRequests,
          });
        }
      } catch (quotaErr) {
        // daily_usage table may not exist yet — skip quota check, do not fail auth
        console.warn("[admin-token-verify] quota check skipped (table may not exist):", quotaErr?.message);
      }
    }

    // Touch last_used_at (fire-and-forget, don't await to keep this fast)
    db.query("UPDATE tokens SET last_used_at = NOW() WHERE id = $1", [row.id]).catch(() => {});

    return resp(200, {
      valid: true,
      tokenId: row.id,
      tokenPrefix: row.token_prefix,
      label: row.label,
      allowedModels: row.allowed_models || null,
      monthlyLimit: row.monthly_limit || null,
    });
  } catch (err) {
    console.error("[admin-token-verify] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
