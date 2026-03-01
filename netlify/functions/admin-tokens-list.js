// admin-tokens-list.js
// Returns all tokens (metadata only — no plaintext tokens ever).
// Auth: Netlify Identity (admin role required).
// GET /api/admin/tokens/list

const { getDb, requireAdmin, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return resp(405, { error: "Method not allowed" });

  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  try {
    const db = getDb();
    const { rows } = await db.query(
      `SELECT
         t.id,
         t.label,
         t.token_prefix,
         t.is_active,
         t.created_at,
         t.last_used_at,
         t.expires_at,
         t.created_by,
         t.allowed_models,
         t.monthly_limit,
         t.notes,
         COALESCE(d.requests_this_month, 0)      AS requests_this_month,
         COALESCE(d.tokens_this_month, 0)         AS tokens_this_month
       FROM tokens t
       LEFT JOIN (
         SELECT
           token_id,
           SUM(requests)     AS requests_this_month,
           SUM(total_tokens) AS tokens_this_month
         FROM daily_usage
         WHERE date >= DATE_TRUNC('month', NOW())
         GROUP BY token_id
       ) d ON d.token_id = t.id
       ORDER BY t.created_at DESC`
    );

    return resp(200, { tokens: rows });
  } catch (err) {
    console.error("[admin-tokens-list] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
