// admin-usage-logs.js
// Returns paginated raw request logs.
// Auth: Netlify Identity (admin role required).
// GET /api/admin/usage/logs?limit=50&offset=0&tokenId=<optional>&status=<optional>

const { getDb, requireAdmin, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return resp(405, { error: "Method not allowed" });

  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const params = event.queryStringParameters || {};
  const limit  = Math.min(parseInt(params.limit  || "50",  10), 200);
  const offset = Math.max(parseInt(params.offset || "0",   10), 0);
  const tokenId = params.tokenId || null;
  const status  = params.status  || null; // "error" → status_code >= 400

  const conditions = [];
  const args = [];

  if (tokenId) {
    args.push(tokenId);
    conditions.push(`token_id = $${args.length}`);
  }
  if (status === "error") {
    conditions.push("status_code >= 400");
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  args.push(limit, offset);
  const limitPlaceholder  = `$${args.length - 1}`;
  const offsetPlaceholder = `$${args.length}`;

  try {
    const db = getDb();

    const { rows: logs } = await db.query(
      `SELECT
         id, request_id, token_prefix, model, endpoint,
         prompt_tokens, candidates_tokens, thoughts_tokens, total_tokens,
         finish_reason, status_code, duration_ms, error, ts
       FROM request_logs
       ${where}
       ORDER BY ts DESC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      args
    );

    // Total count for pagination
    const countArgs = args.slice(0, -2);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS total FROM request_logs ${where}`,
      countArgs
    );

    return resp(200, {
      logs,
      total: Number(countRows[0].total),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[admin-usage-logs] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
