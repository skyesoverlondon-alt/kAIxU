// netlify/functions/kaixu-stream.js
// Kaixu Gate Delta -> Gemini API proxy (SSE streaming)
//
// Note: Streaming in Netlify Functions works for many cases, but some environments/browsers
// may buffer responses. This endpoint is optional.

const { corsHeaders, json, enforceAuth, safeJsonParse, clampInt } = require("./_kaixu_utils");

exports.handler = async (event) => {
  const cors = corsHeaders(event);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed. Use POST." }, cors);
  }

  const auth = enforceAuth(event);
  if (!auth.ok) return json(auth.code, { ok: false, error: auth.message }, cors);

  const key = (process.env.KAIXU_GEMINI_API_KEY || "").toString().trim();
  if (!key) return json(500, { ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }, cors);

  const maxBytes = clampInt(process.env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = event.body || "";
  if (rawBody.length > maxBytes) {
    return json(413, { ok: false, error: `Body too large. Max ${maxBytes} bytes.` }, cors);
  }

  const parsed = safeJsonParse(rawBody);
  if (!parsed.ok) return json(400, { ok: false, error: "Invalid JSON body." }, cors);

  const body = parsed.value || {};
  const model = String(body.model || process.env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash").trim();

  // Pass through a raw Gemini request body if provided at body.request, else use body directly
  const reqBody = (body.request && typeof body.request === "object") ? body.request : body;

  const timeoutMs = clampInt(process.env.KAIXU_TIMEOUT_MS, 1000, 60000, 25000);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(reqBody),
      signal: ac.signal,
    });

    const upstreamText = await upstream.text();

    // The upstream stream uses SSE-style chunks, but Netlify may buffer.
    // We return what we got; callers can parse lines that start with "data:".
    if (!upstream.ok) {
      let j = null;
      try { j = JSON.parse(upstreamText); } catch (_) {}
      return json(upstream.status, { ok: false, error: "Upstream model error.", details: j || upstreamText.slice(0, 4000) }, cors);
    }

    return {
      statusCode: 200,
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
      },
      body: upstreamText,
    };
  } catch (e) {
    const msg = (e && e.name === "AbortError") ? `Upstream timeout after ${timeoutMs}ms.` : (e && e.message ? e.message : String(e));
    return json(502, { ok: false, error: msg }, cors);
  } finally {
    clearTimeout(t);
  }
};
