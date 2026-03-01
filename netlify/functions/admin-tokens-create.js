// admin-tokens-create.js
// Creates a new app token and stores its hash in Neon.
// Auth: Netlify Identity (admin role required).
// POST /api/admin/tokens/create
// Body: { label, allowedModels?, monthlyLimit?, expiresAt?, notes? }
// Returns: { token (ONCE, plaintext), id, tokenPrefix, label }

const {
  getDb,
  generateToken,
  hashToken,
  tokenPrefix,
  requireAdmin,
  resp,
  preflight,
} = require("./_admin_db");

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

  const { label, allowedModels, monthlyLimit, expiresAt, notes } = body;

  if (!label || typeof label !== "string" || !label.trim()) {
    return resp(400, { error: "label is required" });
  }

  const token = generateToken();
  const hash = await hashToken(token);
  const prefix = tokenPrefix(token);
  const actor = context.clientContext?.user?.email || "admin";

  try {
    const db = getDb();
    const { rows } = await db.query(
      `INSERT INTO tokens
         (label, token_hash, token_prefix, created_by, allowed_models, monthly_limit, expires_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, label, token_prefix, created_at`,
      [
        label.trim(),
        hash,
        prefix,
        actor,
        allowedModels || null,
        monthlyLimit || null,
        expiresAt || null,
        notes || null,
      ]
    );

    const created = rows[0];

    // Audit event
    await db.query(
      `INSERT INTO system_events (event_type, actor, target, details)
       VALUES ('token_created', $1, $2, $3)`,
      [actor, label.trim(), JSON.stringify({ tokenId: created.id, prefix })]
    );

    return resp(201, {
      token,           // ← plaintext returned ONCE — never stored
      id: created.id,
      tokenPrefix: created.token_prefix,
      label: created.label,
      createdAt: created.created_at,
      warning: "Store this token now. It will NEVER be shown again.",
    });
  } catch (err) {
    console.error("[admin-tokens-create] DB error:", err.message);
    return resp(500, { error: "Database error" });
  }
};
