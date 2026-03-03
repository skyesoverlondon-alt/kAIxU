// netlify/functions/kaixu-telemetry.js
// Lightweight client beacon receiver.
// Accepts sendBeacon / fetch POST with arbitrary JSON, writes to Neon daily_usage
// or just acknowledges silently — never crashes the caller.

const { corsHeaders, json } = require("./_kaixu_utils");
const { getDatabaseUrl } = require("./_db_url");

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  // sendBeacon uses POST; allow GET from uptime monitors too
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" }, cors);
  }

  // Parse body — tolerate malformed beacons (browsers fire-and-forget these)
  let payload = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (_) {
    // Swallow — still return 200 so sendBeacon doesn't retry
  }

  const {
    event: evtName = "unknown",
    page = "",
    requestId = "",
    sessionId = "",
    durationMs = null,
    meta = {},
  } = payload;

  // Best-effort log to Neon — if env not set, skip silently
  const dsn = getDatabaseUrl();
  if (dsn) {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(dsn);
      await sql`
        INSERT INTO telemetry_events
          (event_name, page, request_id, session_id, duration_ms, meta, created_at)
        VALUES (
          ${String(evtName).slice(0, 64)},
          ${String(page).slice(0, 256)},
          ${String(requestId).slice(0, 64)},
          ${String(sessionId).slice(0, 64)},
          ${durationMs != null ? Number(durationMs) : null},
          ${JSON.stringify(meta)},
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
    } catch (dbErr) {
      // Never let a DB error surface to the client
      console.warn("[kAIxU telemetry] DB write failed:", dbErr?.message);
    }
  }

  // Always 200 — browsers don't wait for this response
  return json(200, { ok: true }, cors);
};
