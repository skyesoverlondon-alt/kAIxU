/**
 * kAIxu Gate — Cloudflare Worker
 * Skyes Over London LC
 *
 * Routes:
 *   GET  /v1/health    → gateway status
 *   GET  /v1/models    → available models
 *   POST /v1/generate  → non-streaming Gemini proxy
 *   POST /v1/stream    → true SSE streaming Gemini proxy (no timeout)
 *
 * Env vars (set via wrangler.toml [vars] or `wrangler secret put`):
 *   KAIXU_GEMINI_API_KEY   (secret)
 *   KAIXU_APP_TOKENS       (secret, comma-separated)
 *   KAIXU_DEFAULT_MODEL
 *   KAIXU_OPEN_GATE
 *   KAIXU_ALLOWED_ORIGINS
 *   KAIXU_GLOBAL_SYSTEM
 *   KAIXU_MAX_BODY_BYTES
 */

// ─── Utilities ────────────────────────────────────────────────────────────────

function csvToSet(v) {
  return new Set(
    String(v || "").split(",").map(s => s.trim()).filter(Boolean)
  );
}

function corsHeaders(request, env) {
  const allow = env.KAIXU_ALLOWED_ORIGINS || "";
  const origin = request.headers.get("Origin") || "";

  if (allow.trim()) {
    const set = csvToSet(allow);
    if (set.has(origin)) {
      return {
        "Access-Control-Allow-Origin": origin,
        "Vary": "Origin",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-TOKEN",
        "Access-Control-Max-Age": "86400",
      };
    }
    return {}; // origin not allowed — browser will block
  }

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-TOKEN",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResp(status, obj, cors = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

function enforceAuth(request, env) {
  const openGate = String(env.KAIXU_OPEN_GATE || "0") === "1";
  if (openGate) return { ok: true };

  const tokens = csvToSet(env.KAIXU_APP_TOKENS || "");
  if (!tokens.size) return { ok: false, code: 500, message: "Gateway misconfigured: KAIXU_APP_TOKENS is not set." };

  const auth = request.headers.get("Authorization") || "";
  const xToken = request.headers.get("X-KAIXU-TOKEN") || "";
  let token = "";
  if (auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  else if (xToken) token = xToken.trim();

  if (!token) return { ok: false, code: 401, message: "Missing app token. Send Authorization: Bearer <token>." };
  if (!tokens.has(token)) return { ok: false, code: 403, message: "Invalid app token." };
  return { ok: true };
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

// ─── Generate helpers (ported from kaixu-generate.js) ────────────────────────

function mapMessagesToContents(messages) {
  const out = [];
  for (const m of (messages || [])) {
    if (!m || !m.role) continue;
    const role = String(m.role);
    const text = m.content == null ? "" : String(m.content);
    if (!text.trim()) continue;
    if (role === "assistant" || role === "model") {
      out.push({ role: "model", parts: [{ text }] });
    } else {
      out.push({ role: "user", parts: [{ text }] });
    }
  }
  return out.length ? out : null;
}

function buildRequestBody(body, env) {
  const system = (body.system || body.systemInstruction || "").toString().trim();
  const globalSystem = (env.KAIXU_GLOBAL_SYSTEM || "").toString().trim();

  let contents = Array.isArray(body.contents) ? body.contents : null;

  if (!contents && Array.isArray(body.messages)) {
    contents = mapMessagesToContents(body.messages);
  }

  if (!contents && body.input && typeof body.input === "object") {
    const t = String(body.input.type || "text");
    if (t === "text") {
      const text = body.input.content == null ? "" : String(body.input.content);
      contents = [{ role: "user", parts: [{ text }] }];
    }
  }

  if (!contents && typeof body === "string") {
    contents = [{ role: "user", parts: [{ text: body }] }];
  }

  if (!contents) return { ok: false, error: "Missing input. Provide `input`, `messages`, or `contents`." };

  const generationConfig = (body.generationConfig && typeof body.generationConfig === "object")
    ? { ...body.generationConfig }
    : (body.config && typeof body.config === "object")
      ? { ...body.config }
      : {};

  const output = (body.output && typeof body.output === "object") ? body.output : null;
  if (output && output.format) {
    const fmt = String(output.format).toLowerCase();
    if (fmt === "json")     generationConfig.responseMimeType = "application/json";
    if (fmt === "text")     generationConfig.responseMimeType = "text/plain";
    if (fmt === "markdown") generationConfig.responseMimeType = "text/plain";
  }

  const req = {
    contents,
    ...(body.tools       ? { tools: body.tools }             : {}),
    ...(body.toolConfig  ? { toolConfig: body.toolConfig }   : {}),
    ...(body.safetySettings ? { safetySettings: body.safetySettings } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };

  const sysText = [globalSystem, system].filter(Boolean).join("\n\n").trim();
  if (sysText) req.systemInstruction = { role: "system", parts: [{ text: sysText }] };

  return { ok: true, value: req };
}

function extractTextFromGemini(respJson) {
  try {
    const c = respJson.candidates && respJson.candidates[0];
    const parts = c && c.content && c.content.parts;
    if (!Array.isArray(parts)) return "";
    return parts.filter(p => !p.thought).map(p => p.text || "").join("");
  } catch (_) { return ""; }
}

function extractFinishReason(respJson) {
  try {
    const c = respJson.candidates && respJson.candidates[0];
    return (c && c.finishReason) || null;
  } catch (_) { return null; }
}

function extractUsage(respJson) {
  const u = respJson.usageMetadata || respJson.usage || null;
  if (!u) return { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
  return {
    promptTokens:      Number(u.promptTokenCount    || u.promptTokens     || 0) || 0,
    candidatesTokens:  Number(u.candidatesTokenCount || u.completionTokens || 0) || 0,
    thoughtsTokens:    Number(u.thoughtsTokenCount  || 0) || 0,
    totalTokens:       Number(u.totalTokenCount     || u.totalTokens      || 0) || 0,
  };
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleHealth(request, env) {
  const cors = corsHeaders(request, env);
  const hasKey    = !!(env.KAIXU_GEMINI_API_KEY && env.KAIXU_GEMINI_API_KEY.trim());
  const hasTokens = !!(env.KAIXU_APP_TOKENS && env.KAIXU_APP_TOKENS.trim());
  const openGate  = String(env.KAIXU_OPEN_GATE || "0") === "1";

  return jsonResp(200, {
    ok: true,
    name: "Kaixu Gate Delta",
    runtime: "cloudflare-workers",
    kAIxu: true,
    keyConfigured: hasKey,
    authConfigured: hasTokens || openGate,
    openGate,
    time: new Date().toISOString(),
  }, cors);
}

async function handleModels(request, env) {
  const cors = corsHeaders(request, env);
  const models = [
    { id: "gemini-2.5-flash", label: "gemini-2.5-flash (fast)" },
    { id: "gemini-2.5-pro",   label: "gemini-2.5-pro (best quality)" },
  ];
  return jsonResp(200, {
    ok: true,
    defaultModel: env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash",
    models,
  }, cors);
}

async function handleGenerate(request, env) {
  const cors = corsHeaders(request, env);

  const auth = enforceAuth(request, env);
  if (!auth.ok) return jsonResp(auth.code, { ok: false, error: auth.message }, cors);

  const key = (env.KAIXU_GEMINI_API_KEY || "").trim();
  if (!key) return jsonResp(500, { ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }, cors);

  const maxBytes = clampInt(env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = await request.text();
  if (rawBody.length > maxBytes) return jsonResp(413, { ok: false, error: `Body too large. Max ${maxBytes} bytes.` }, cors);

  let body;
  try { body = JSON.parse(rawBody); }
  catch (_) { return jsonResp(400, { ok: false, error: "Invalid JSON body." }, cors); }

  const model = String(body.model || env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash").trim();
  const built = buildRequestBody(body, env);
  if (!built.ok) return jsonResp(400, { ok: false, error: built.error }, cors);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(built.value),
    });
  } catch (e) {
    return jsonResp(502, { ok: false, error: e.message || String(e) }, cors);
  }

  const text = await upstream.text();
  let upstreamJson = null;
  try { upstreamJson = JSON.parse(text); } catch (_) {}

  if (!upstream.ok) {
    return jsonResp(upstream.status, {
      ok: false,
      error: "Upstream model error.",
      details: upstreamJson || { raw: text.slice(0, 4000) },
    }, cors);
  }

  const outText      = upstreamJson ? extractTextFromGemini(upstreamJson) : "";
  const usage        = upstreamJson ? extractUsage(upstreamJson)          : { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
  const finishReason = upstreamJson ? extractFinishReason(upstreamJson)   : null;

  if (finishReason === "MAX_TOKENS" && !outText) {
    return jsonResp(200, {
      ok: false,
      error: "Model hit token limit before producing output. Increase maxOutputTokens (thinking models like gemini-2.5-pro require a larger budget).",
      model, finishReason, usage,
    }, cors);
  }

  const includeRaw = !!body.includeRaw;
  return jsonResp(200, {
    ok: true,
    model,
    text: outText,
    finishReason,
    usage,
    ...(includeRaw ? { raw: upstreamJson } : {}),
  }, cors);
}

async function handleStream(request, env) {
  const cors = corsHeaders(request, env);

  const auth = enforceAuth(request, env);
  if (!auth.ok) return jsonResp(auth.code, { ok: false, error: auth.message }, cors);

  const key = (env.KAIXU_GEMINI_API_KEY || "").trim();
  if (!key) return jsonResp(500, { ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }, cors);

  const maxBytes = clampInt(env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = await request.text();
  if (rawBody.length > maxBytes) return jsonResp(413, { ok: false, error: `Body too large. Max ${maxBytes} bytes.` }, cors);

  let body;
  try { body = JSON.parse(rawBody); }
  catch (_) { return jsonResp(400, { ok: false, error: "Invalid JSON body." }, cors); }

  const model = String(body.model || env.KAIXU_DEFAULT_MODEL || "gemini-2.5-flash").trim();

  // Accept raw Gemini request at body.request, or build from body normally
  let reqBody;
  if (body.request && typeof body.request === "object") {
    reqBody = body.request;
  } else {
    const built = buildRequestBody(body, env);
    if (!built.ok) return jsonResp(400, { ok: false, error: built.error }, cors);
    reqBody = built.value;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(reqBody),
    });
  } catch (e) {
    return jsonResp(502, { ok: false, error: e.message || String(e) }, cors);
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    let errJson = null;
    try { errJson = JSON.parse(errText); } catch (_) {}
    return jsonResp(upstream.status, {
      ok: false, error: "Upstream model error.",
      details: errJson || errText.slice(0, 4000),
    }, cors);
  }

  // Pipe directly — Cloudflare Workers have no response timeout
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const { method } = request;
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const cors = corsHeaders(request, env);

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Router
    if (method === "GET"  && path === "/v1/health")   return handleHealth(request, env);
    if (method === "GET"  && path === "/v1/models")   return handleModels(request, env);
    if (method === "POST" && path === "/v1/generate") return handleGenerate(request, env);
    if (method === "POST" && path === "/v1/stream")   return handleStream(request, env);

    // Health also on root GET for browser
    if (method === "GET" && (path === "/" || path === "")) return handleHealth(request, env);

    return jsonResp(404, { ok: false, error: `No route for ${method} ${path}` }, cors);
  },
};
