// netlify/functions/kaixu-generate.js
// Kaixu Gate Delta -> Gemini API proxy (standard, non-streaming)

const {
  corsHeaders,
  json,
  enforceAuth,
  safeJsonParse,
  clampInt,
} = require("./_kaixu_utils");

function mapMessagesToContents(messages) {
  // OpenAI-ish messages -> Gemini contents[]
  // messages: [{role:"system"|"user"|"assistant", content:"..."}]
  const out = [];
  for (const m of (messages || [])) {
    if (!m || !m.role) continue;
    const role = String(m.role);
    const text = (m.content == null) ? "" : String(m.content);
    if (!text.trim()) continue;

    if (role === "assistant" || role === "model") {
      out.push({ role: "model", parts: [{ text }] });
    } else if (role === "system") {
      // We'll handle system separately using systemInstruction where possible,
      // but if caller included it in messages, we keep it as a content turn with role "user"
      // and also return it for systemInstruction.
      out.push({ role: "user", parts: [{ text }] });
    } else {
      out.push({ role: "user", parts: [{ text }] });
    }
  }
  return out.length ? out : null;
}

function buildRequestBody(body) {
  const system = (body.system || body.systemInstruction || "").toString().trim();
  const globalSystem = (process.env.KAIXU_GLOBAL_SYSTEM || "").toString().trim();

  // Prefer raw Gemini 'contents' if provided
  let contents = Array.isArray(body.contents) ? body.contents : null;

  // Else accept OpenAI-ish messages
  if (!contents && Array.isArray(body.messages)) {
    contents = mapMessagesToContents(body.messages);
  }

  // Else accept our simple input envelope
  if (!contents && body.input && typeof body.input === "object") {
    const t = String(body.input.type || "text");
    if (t === "text") {
      const text = (body.input.content == null) ? "" : String(body.input.content);
      contents = [{ role: "user", parts: [{ text }] }];
    }
  }

  // Minimal fallback: treat entire body as prompt if it's a string (rare)
  if (!contents && typeof body === "string") {
    contents = [{ role: "user", parts: [{ text: body }] }];
  }

  if (!contents) return { ok: false, error: "Missing input. Provide `input`, `messages`, or `contents`." };

  // Generation config passthrough
  const generationConfig = (body.generationConfig && typeof body.generationConfig === "object")
    ? { ...body.generationConfig }
    : (body.config && typeof body.config === "object")
      ? { ...body.config }
      : {};

  // Convenience output control
  const output = (body.output && typeof body.output === "object") ? body.output : null;
  if (output && output.format) {
    const fmt = String(output.format).toLowerCase();
    if (fmt === "json") generationConfig.responseMimeType = "application/json";
    if (fmt === "text") generationConfig.responseMimeType = "text/plain";
    if (fmt === "markdown") generationConfig.responseMimeType = "text/plain";
  }

  // No server-side output token cap — callers control their own generationConfig.
  // Pass through whatever maxOutputTokens the caller sent (or none, letting the model use its own ceiling).

  const req = {
    contents,
    ...(body.tools ? { tools: body.tools } : {}),
    ...(body.toolConfig ? { toolConfig: body.toolConfig } : {}),
    ...(body.safetySettings ? { safetySettings: body.safetySettings } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };

  // System instruction:
  // Use systemInstruction if we have global/per-request system text.
  const sysText = [globalSystem, system].filter(Boolean).join("\n\n").trim();
  if (sysText) {
    req.systemInstruction = { role: "system", parts: [{ text: sysText }] };
  }

  return { ok: true, value: req };
}

function extractTextFromGemini(respJson) {
  try {
    const c = respJson.candidates && respJson.candidates[0];
    const parts = c && c.content && c.content.parts;
    if (!Array.isArray(parts)) return "";
    // Skip thought parts (gemini-2.5-pro thinking model returns thought:true parts)
    return parts.filter(p => !p.thought).map(p => p.text || "").join("");
  } catch (_) {
    return "";
  }
}

function extractFinishReason(respJson) {
  try {
    const c = respJson.candidates && respJson.candidates[0];
    return (c && c.finishReason) || null;
  } catch (_) {
    return null;
  }
}

function extractUsage(respJson) {
  const u = respJson.usageMetadata || respJson.usage || null;
  if (!u) return { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
  return {
    promptTokens: Number(u.promptTokenCount || u.promptTokens || 0) || 0,
    candidatesTokens: Number(u.candidatesTokenCount || u.completionTokens || 0) || 0,
    thoughtsTokens: Number(u.thoughtsTokenCount || 0) || 0,
    totalTokens: Number(u.totalTokenCount || u.totalTokens || 0) || 0,
  };
}

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
  if (!parsed.ok) {
    return json(400, { ok: false, error: "Invalid JSON body." }, cors);
  }
  const body = parsed.value || {};

  const model = String(body.model || process.env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash").trim();
  const built = buildRequestBody(body);
  if (!built.ok) return json(400, { ok: false, error: built.error }, cors);

  const timeoutMs = clampInt(process.env.KAIXU_TIMEOUT_MS, 1000, 60000, 25000);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(built.value),
      signal: ac.signal,
    });

    const text = await upstream.text();
    let upstreamJson = null;
    try { upstreamJson = JSON.parse(text); } catch (_) {}

    if (!upstream.ok) {
      return json(upstream.status, {
        ok: false,
        error: "Upstream model error.",
        details: upstreamJson || { raw: text.slice(0, 4000) },
      }, cors);
    }

    const outText = upstreamJson ? extractTextFromGemini(upstreamJson) : "";
    const usage = upstreamJson ? extractUsage(upstreamJson) : { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
    const finishReason = upstreamJson ? extractFinishReason(upstreamJson) : null;

    // If model finished due to MAX_TOKENS with no output, surface a clear error
    if (finishReason === "MAX_TOKENS" && !outText) {
      return json(200, {
        ok: false,
        error: "Model hit token limit before producing output. Increase maxOutputTokens (thinking models like gemini-2.5-pro require a larger budget).",
        model,
        finishReason,
        usage,
      }, cors);
    }

    const includeRaw = !!body.includeRaw;
    return json(200, {
      ok: true,
      model,
      text: outText,
      finishReason,
      usage,
      ...(includeRaw ? { raw: upstreamJson } : {}),
    }, cors);

  } catch (e) {
    const msg = (e && e.name === "AbortError") ? `Upstream timeout after ${timeoutMs}ms.` : (e && e.message ? e.message : String(e));
    return json(502, { ok: false, error: msg }, cors);
  } finally {
    clearTimeout(t);
  }
};
