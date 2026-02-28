// netlify/functions/kaixu-stream.js
// Kaixu Gate Delta -> Gemini API proxy (true SSE streaming via Netlify Functions v2)
//
// Uses streamifyResponse from @netlify/functions v2 to pipe Gemini's ReadableStream
// directly to the caller with zero buffering — no timeout on response body.

const { streamifyResponse } = require("@netlify/functions");
const { corsHeaders, json, enforceAuth, safeJsonParse, clampInt } = require("./_kaixu_utils");

exports.handler = streamifyResponse(async (event) => {
  const cors = corsHeaders(event);

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (event.httpMethod !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed. Use POST." }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auth = enforceAuth(event);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.message }), {
      status: auth.code,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const key = (process.env.KAIXU_GEMINI_API_KEY || "").toString().trim();
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const maxBytes = clampInt(process.env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = event.body || "";
  if (rawBody.length > maxBytes) {
    return new Response(JSON.stringify({ ok: false, error: `Body too large. Max ${maxBytes} bytes.` }), {
      status: 413,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const parsed = safeJsonParse(rawBody);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = parsed.value || {};
  const model = String(body.model || process.env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash").trim();

  // Accept raw Gemini request body at body.request, or use body directly
  const reqBody = (body.request && typeof body.request === "object") ? body.request : body;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(reqBody),
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    let errJson = null;
    try { errJson = JSON.parse(errText); } catch (_) {}
    return new Response(JSON.stringify({ ok: false, error: "Upstream model error.", details: errJson || errText.slice(0, 4000) }), {
      status: upstream.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Pipe the upstream ReadableStream directly — zero buffering, true SSE
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});

