// admin-tokens-revoke.js
// Sets is_active = false for a token. Non-reversible via API (re-enable in DB only).
// Auth: Netlify Identity (admin role required).
// POST /api/admin/tokens/revoke
// Body: { id }

const { getDb, requireAdmin, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  const authErr = requireAdmin(context);
  if (authErr) return authErr;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { error: "Invalid JSON" });
  }

  const { id } = body;
  if (!id) return resp(400, { error: "id required" });

  const actor = context.clientContext?.user?.email || "admin";

  try {
    const db = getDb();

    const { rows } = await db.query(
      `UPDATE tokens SET is_active = FALSE WHERE id = $1 RETURNING id, label, token_prefix`,
      [id]
    );

    if (!rows.length) return resp(404, { error: "Token not found" });

    const revoked = rows[0];

    await db.query(
      `INSERT INTO system_events (event_type, actor, target, details)
       VALUES ('token_revoked', $1, $2, $3)`,
      [actor, revoked.label, JSON.stringify({ tokenId: revoked.id, prefix: revoked.token_prefix })]
    );

    return resp(200, { revoked: true, id: revoked.id, label: revoked.label });
  } catch (err) {
    console.error("[admin-tokens-revoke] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
