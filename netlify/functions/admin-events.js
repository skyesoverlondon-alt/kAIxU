// admin-events.js
// Returns paginated system audit events.
// Auth: Netlify Identity (admin role required).
// GET /api/admin/events?limit=50&offset=0&type=<optional>

const { getDb, requireAdmin, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "GET") return resp(405, { error: "Method not allowed" });

  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  const params = event.queryStringParameters || {};
  const limit  = Math.min(parseInt(params.limit  || "50", 10), 200);
  const offset = Math.max(parseInt(params.offset || "0",  10), 0);
  const type   = params.type || null;

  const conditions = [];
  const args = [];

  if (type) {
    args.push(type);
    conditions.push(`event_type = $${args.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  args.push(limit, offset);
  const limitPlaceholder  = `$${args.length - 1}`;
  const offsetPlaceholder = `$${args.length}`;

  try {
    const db = getDb();

    const { rows: events } = await db.query(
      `SELECT id, event_type, actor, target, details, ts
       FROM system_events
       ${where}
       ORDER BY ts DESC
       LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      args
    );

    const countArgs = args.slice(0, -2);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS total FROM system_events ${where}`,
      countArgs
    );

    return resp(200, {
      events,
      total: Number(countRows[0].total),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[admin-events] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
