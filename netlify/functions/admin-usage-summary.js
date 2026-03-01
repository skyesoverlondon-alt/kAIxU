// admin-usage-summary.js
// Returns aggregated daily usage stats.
// Auth: Netlify Identity (admin role required).
// GET /api/admin/usage/summary?days=30&tokenId=<optional>

const { getDb, requireAdmin, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return resp(405, { error: "Method not allowed" });

  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const params = event.queryStringParameters || {};
  const days = Math.min(parseInt(params.days || "30", 10), 365);
  const tokenId = params.tokenId || null;

  try {
    const db = getDb();

    // Per-day totals
    const dailyArgs = [days];
    let tokenFilter = "";
    if (tokenId) {
      tokenFilter = " AND du.token_id = $2";
      dailyArgs.push(tokenId);
    }

    const { rows: daily } = await db.query(
      `SELECT
         du.date,
         SUM(du.requests)     AS requests,
         SUM(du.total_tokens) AS total_tokens,
         SUM(du.errors)       AS errors
       FROM daily_usage du
       WHERE du.date >= CURRENT_DATE - INTERVAL '1 day' * $1${tokenFilter}
       GROUP BY du.date
       ORDER BY du.date DESC`,
      dailyArgs
    );

    // Per-token totals for the window
    const tokenArgs = [days];
    let tokenFilter2 = "";
    if (tokenId) {
      tokenFilter2 = " AND du.token_id = $2";
      tokenArgs.push(tokenId);
    }

    const { rows: perToken } = await db.query(
      `SELECT
         t.label,
         t.token_prefix,
         t.is_active,
         SUM(du.requests)     AS requests,
         SUM(du.total_tokens) AS total_tokens,
         SUM(du.errors)       AS errors
       FROM daily_usage du
       JOIN tokens t ON t.id = du.token_id
       WHERE du.date >= CURRENT_DATE - INTERVAL '1 day' * $1${tokenFilter2}
       GROUP BY t.id, t.label, t.token_prefix, t.is_active
       ORDER BY total_tokens DESC`,
      tokenArgs
    );

    // Grand totals
    const totals = daily.reduce(
      (acc, row) => ({
        requests: acc.requests + Number(row.requests),
        total_tokens: acc.total_tokens + Number(row.total_tokens),
        errors: acc.errors + Number(row.errors),
      }),
      { requests: 0, total_tokens: 0, errors: 0 }
    );

    return resp(200, { days, totals, daily, perToken });
  } catch (err) {
    console.error("[admin-usage-summary] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
