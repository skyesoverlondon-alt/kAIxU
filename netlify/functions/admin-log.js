// admin-log.js
// Fire-and-forget logging endpoint called by the Cloudflare Worker.
// Auth: KAIXU_SERVICE_SECRET (x-kaixu-service header) — NOT Netlify Identity.
// POST /api/admin/log
// Body: { requestId, tokenId, tokenPrefix, model, endpoint, promptTokens,
//         candidatesTokens, thoughtsTokens, totalTokens, finishReason,
//         statusCode, durationMs, error }
// Returns: 202 always (worker does not wait for DB write confirmation)

const { getDb, requireServiceSecret, resp, preflight } = require("./_admin_db");

exports.handler = async function (event, context) {
  if (event.httpMethod === "OPTIONS") return preflight();
  if (event.httpMethod !== "POST") return resp(405, { error: "Method not allowed" });

  const authErr = requireServiceSecret(event);
  if (authErr) return authErr;

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { error: "Invalid JSON" });
  }

  const {
    requestId,
    tokenId,
    tokenPrefix,
    model,
    endpoint,
    promptTokens = 0,
    candidatesTokens = 0,
    thoughtsTokens = 0,
    totalTokens = 0,
    finishReason,
    statusCode,
    durationMs,
    error,
  } = body;

  try {
    const db = getDb();
    await db.query(
      `INSERT INTO request_logs
         (request_id, token_id, token_prefix, model, endpoint,
          prompt_tokens, candidates_tokens, thoughts_tokens, total_tokens,
          finish_reason, status_code, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        requestId || null,
        tokenId || null,
        tokenPrefix || null,
        model || null,
        endpoint || null,
        promptTokens,
        candidatesTokens,
        thoughtsTokens,
        totalTokens,
        finishReason || null,
        statusCode || null,
        durationMs || null,
        error || null,
      ]
    );
  } catch (err) {
    // Log to Netlify function logs but never fail the caller
    console.error("[admin-log] DB error:", err.message);
  }

  // Always 202 — worker is not blocking on this
  return {
    statusCode: 202,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queued: true }),
  };
};
