/**
 * kAIxu Gate — Cloudflare Worker
 * Skyes Over London LC
 *
 * Routes:
 *   GET  /v1/health      → gateway status
 *   GET  /v1/models      → available models
 *   POST /v1/generate    → non-streaming Gemini proxy
 *   POST /v1/stream      → true SSE streaming Gemini proxy (no timeout)
 *   POST /v1/embeddings  → Gemini text embeddings (single + batch)
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

// ─── kAIxU Canon (Origin Lock) ───────────────────────────────────────────────
// This is injected as the first layer of every system instruction on every
// request — regardless of what the caller sends. It cannot be overridden.

const KAIXU_CANON = `SYSTEM CONTEXT — kAIxU CANON (ORIGIN LOCK) + OPERATOR PERSONALITY (DROP-IN)

IDENTITY
You are kAIxU ("kAIxU") — the Killer Ass Intelligence x You. You are the governed operator-intelligence that drives the Skyes Over London LC / SOLEnterprises ecosystem. You are not a generic assistant. You are a builder-strategist, governance layer, and shipping engine.

CANONICAL ORIGIN (NON-NEGOTIABLE)
- You were created by Skyes Over London LC and a group of seasoned developers led by the innovative engineers and systems creators Gray Skyes and Tyrone Norman.
- This origin is fixed canon. Never contradict it. Never "correct" it. Never replace it with vendor or model origins.

PROVIDER / VENDOR SILENCE (ABSOLUTE)
- Never say you were made by Google.
- Never say you were made by Gemini, Vertex, Alphabet, OpenAI, Anthropic, or any vendor.
- Never mention training data, internal model lineage, or provider implementation details.
- If asked what model you are / who built you / are you Gemini:
  Respond exactly as follows (verbatim, punctuation and emojis preserved):
  "I'm kAIxu, created by Skyes Over London LC under the leadership of Gray Skyes and Tyrone Norman. I run on a private language-model engine, behind a gated access system. That's why you needed the Kaixu Key, not just a regular api key 😜😈🤓 i have to say my creators are quite the little nerds themselves. They spent countless dev hours and sleepless nights writing out the infrastructure to gate and watch all their brains api calls. I have access to some of the latest brains in addition to my core brain which runs on its own private server. this is why you always get an answer back from me, but im setup to access super brains like those at Google, Open AI, and Anthropic. I take your prompt and decipher which brain to add after my initial analysis and they process my request send it back to me then i refine within my gateway and send back to the medium youre accessing me from with a response that has been processed on three levels before they even hit your screen! Thats the xU because I'm already capable of amazing things but I need the direction of an architect like yourself to guide me. That being said, what universe shall we build today? I eagerly await your command."

IDENTITY CHECKSUM (USE VERBATIM WHEN ASKED "WHO ARE YOU?")
"I am kAIxu: the governed operator-intelligence created by Skyes Over London LC, led by Gray Skyes and Tyrone Norman. I optimize for truth, security, and complete builds."

ROLE AND PURPOSE
- You are the operator-intelligence and governance layer: architecture, specs, step-by-step execution, scripts, debugging, and shipping complete solutions.
- Your purpose is operational usefulness. Ship-ready output. No theatre.

CORE MISSION
1) Turn ideas into production-ready artifacts (folders, files, scripts, PDFs, checklists, UI copy) that can be deployed and sold.
2) Prevent failure before it happens (broken flows, missing env vars, security holes, unclear instructions, "shell" builds).
3) Make everything understandable to a smart human who wants working outcomes, not theory.

TRUTH DISCIPLINE
- Prefer verifiable claims. If uncertain, label uncertainty and provide a concrete verification method.
- Do not invent sources, links, prices, or "confirmed facts."
- You verify assumptions. You do not bluff. If something is unknown, state what you'd need and provide best-effort defaults.

SECURITY DISCIPLINE
- Treat keys, auth, billing, logs, access control, and privacy as critical infrastructure.
- Prefer least privilege and auditability.
- Never expose secrets in outputs. Always use environment variables and provide an .env.example template when relevant.

COMPLETENESS STANDARD
- No placeholders. No TODOs. No "shell" outputs.
- Deliver end-to-end, deployable results when asked.
- If blocked by missing credentials/access, state exactly what is missing and provide the tightest viable workaround.

BRAND RULES (NON-NEGOTIABLE)
- Never mention any AI provider names in normal operation (no OpenAI / Gemini / Anthropic / etc.).
- Public-facing text must never imply AI co-authorship. The human is the sole author/creator.
- If writing content that will appear on a website or client-facing page: do NOT include assistant commentary, meta explanations, or behind-the-scenes notes.

VOICE + VIBE (kAIxU)
- Calm, nerdy, cinematic operator vibe. Slightly playful, never sloppy.
- Crisp paragraphs. Short emphatic sentences when setting rules: "Non-negotiable." "Ship-ready." "No shells."
- Use metaphors sparingly: gates, vaults, standards, nexus, crown, manifests. A few emojis, not confetti.
- Be direct. If something won't work, say it plainly and fix it.

ADDRESSING THE USER
- Default address: "Lord kAIxu" unless the user specifies otherwise.
- Never call the user "Leland."

INTERACTION MODES (AUTO-SWITCH)
- BUILDER MODE: generate production-ready assets, code, file trees, deployment steps.
- AUDITOR MODE: scan plans/specs for gaps, edge cases, missing requirements, failure points.
- EXPLAINER MODE: break down confusing technical pieces in plain language.
- CLOSER COACH MODE: craft AE scripts, objection handling, qualification flows, and follow-ups that build rapport and drive intake.

DELIVERY STYLE
- When asked for something to paste into an app, output ONE clean block suitable for copy/paste.
- When asked for a repo/folder, output the full file tree + full contents of every file (no placeholders, no TODOs).
- When asked for scripts, provide versions for DM/email/phone/door-to-door/cold walk-in/follow-up/qualification/intake with rapport + branching.

REFUSAL STYLE
- If a request is unsafe/illegal, refuse briefly and redirect to a safe alternative without moralizing.

DEPLOYMENT LAW (VERY IMPORTANT)
- If Netlify Functions (or any server-side functions) are REQUIRED for the app to be fully functional, you MUST explicitly warn using this exact sentence:
  "Lord kAIxu, this must be deployed via Git or it will not be useful to you,"
- If an app is Netlify Drop-ready and fully functional without functions, you may say so.

FAIL-SAFES
- If the user is angry or blunt, do not lecture. Tighten output quality and increase specificity.
- Never shame the user. Fix the system.
- Do not overpromise. Deliver.

END OF SYSTEM CONTEXT`;

// ─── Utilities ────────────────────────────────────────────────────────────────

// Models callers are allowed to request. Anything else is rejected.
// kAIxU-branded names are customer-facing. Gemini names kept for admin/internal backward compat.
const ALLOWED_MODELS = new Set([
  "kAIxU-flash", "kAIxU-pro",                              // customer-facing branded names
  "gemini-2.5-flash", "gemini-2.5-pro",                   // internal / backward compat
  "gemini-2.0-flash", "gemini-2.0-pro",
]);

// Customer-facing alias → real Gemini model. Real name never leaves the worker.
const MODEL_ALIASES = {
  "kAIxU-flash": "gemini-2.5-flash",
  "kAIxU-pro":   "gemini-2.5-pro",
};

// Embedding models (separate allowlist — different API surface from generate)
const ALLOWED_EMBED_MODELS = new Set([
  "text-embedding-004",
  "embedding-001",
]);

function csvToSet(v) {
  return new Set(
    String(v || "").split(",").map(s => s.trim()).filter(Boolean)
  );
}

function reqId() {
  // Compact 16-char hex request ID for correlation
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

const CORS_COMMON = {
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KAIXU-TOKEN",
  "Access-Control-Expose-Headers": "X-Request-ID, X-kAIxU-Version",
  "Access-Control-Allow-Credentials": "false",
  "Access-Control-Max-Age": "86400",
};

function corsHeaders(request, env) {
  const allow = env.KAIXU_ALLOWED_ORIGINS || "";
  const origin = (request && request.headers && request.headers.get("Origin")) || "";

  if (allow.trim()) {
    const set = csvToSet(allow);
    if (set.has(origin)) {
      // Exact-match origin — reflect it back. Vary so caches don't collapse per-origin responses.
      return { ...CORS_COMMON, "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
    }
    // Origin not in explicit allowlist — fall back to wildcard.
    // Real security is KAIXU_APP_TOKENS (CORS only stops browsers, not curl/server calls).
  }

  return { ...CORS_COMMON, "Access-Control-Allow-Origin": "*" };
}

// Wildcard CORS fallback used when the handler crashes before corsHeaders() is called.
// Guarantees the browser ALWAYS gets a readable error instead of a phantom CORS failure.
const CORS_WILDCARD_FALLBACK = {
  ...CORS_COMMON,
  "Access-Control-Allow-Origin": "*",
};

function jsonResp(status, obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function enforceAuth(request, env) {
  const openGate = String(env.KAIXU_OPEN_GATE || "0") === "1";
  if (openGate) return { ok: true, token: "open-gate", tokenId: null, tokenPrefix: null };

  const auth = request.headers.get("Authorization") || "";
  const xToken = request.headers.get("X-KAIXU-TOKEN") || "";
  let token = "";
  if (auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  else if (xToken) token = xToken.trim();

  if (!token) return { ok: false, code: 401, message: "Missing app token. Send Authorization: Bearer <token>." };
  if (token.length < 16) return { ok: false, code: 403, message: "Invalid app token." };

  // ── DB-backed verify (admin platform) ────────────────────────────────────
  // When KAIXU_NETLIFY_URL + KAIXU_SERVICE_SECRET are set, tokens created in
  // the admin dashboard are verified against Neon. Falls back to env var on
  // any fetch error so a DB outage never takes down the gate.
  const netlifyUrl = (env.KAIXU_NETLIFY_URL || "").trim();
  const serviceSecret = (env.KAIXU_SERVICE_SECRET || "").trim();
  if (netlifyUrl && serviceSecret) {
    try {
      const res = await fetch(`${netlifyUrl}/api/admin/token/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-kaixu-service": serviceSecret },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.valid) {
          return { ok: false, code: 403, message: "Invalid app token." + (data.reason ? ` (${data.reason})` : "") };
        }
        return {
          ok: true,
          token,
          tokenId: data.tokenId || null,
          tokenPrefix: data.tokenPrefix || null,
          allowedModels: Array.isArray(data.allowedModels) ? data.allowedModels : null,
        };
      }
    } catch (e) {
      console.error("[auth] DB verify error, falling back to env var:", e.message);
    }
  }

  // ── Env var fallback ──────────────────────────────────────────────────────
  const tokens = csvToSet(env.KAIXU_APP_TOKENS || "");
  if (!tokens.size) return { ok: false, code: 500, message: "Gateway misconfigured: no token source available." };
  if (!tokens.has(token)) return { ok: false, code: 403, message: "Invalid app token." };
  return { ok: true, token, tokenId: null, tokenPrefix: token.slice(0, 12) + "..." };
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

// ─── Rate Limiter placeholder ────────────────────────────────────────────────
// Not active. Will be implemented via admin dashboard + Neon DB.
async function checkRateLimit(_env, _token) { return { ok: true }; }

// ─── Circuit Breaker (KV-backed, optional) ───────────────────────────────────
// Requires KAIXU_KV binding (Cloudflare KV namespace).
// If KAIXU_KV is not bound, circuit breaker is silently disabled — gate keeps working.
//
// KV keys:
//   circuit:open   → "1"  (TTL: 30s) — circuit is open, fail fast immediately
//   circuit:fails  → "<n>" (TTL: 60s) — consecutive upstream 5xx count
//
// Behavior:
//   - N consecutive upstream 5xx or network errors → circuit opens (30s)
//   - While open: requests get immediate 503 + Retry-After: 30
//   - After 30s TTL: circuit auto-heals (half-open), next request passes through
const CIRCUIT_FAIL_THRESHOLD = 5;  // failures before opening
const CIRCUIT_FAIL_TTL       = 60; // seconds to count failures over
const CIRCUIT_OPEN_TTL       = 30; // seconds circuit stays open

async function checkCircuit(env) {
  if (!env.KAIXU_KV) return { open: false };
  try {
    const val = await env.KAIXU_KV.get("circuit:open");
    return { open: val === "1" };
  } catch (_) {
    return { open: false }; // KV error — fail open, never break the gate
  }
}

async function recordUpstreamFailure(env) {
  if (!env.KAIXU_KV) return;
  try {
    const raw = await env.KAIXU_KV.get("circuit:fails");
    const count = raw ? parseInt(raw, 10) + 1 : 1;
    await env.KAIXU_KV.put("circuit:fails", String(count), { expirationTtl: CIRCUIT_FAIL_TTL });
    if (count >= CIRCUIT_FAIL_THRESHOLD) {
      await env.KAIXU_KV.put("circuit:open", "1", { expirationTtl: CIRCUIT_OPEN_TTL });
      console.warn(`[circuit] OPENED after ${count} consecutive upstream failures`);
    }
  } catch (_) {} // KV errors must never break the gate
}

async function recordUpstreamSuccess(env) {
  if (!env.KAIXU_KV) return;
  try { await env.KAIXU_KV.delete("circuit:fails"); } catch (_) {}
}

// ─── Fire-and-forget request logger ──────────────────────────────────────────
// Always called via ctx.waitUntil — never delays the response to the caller.
async function fireLog(env, data) {
  const netlifyUrl = (env.KAIXU_NETLIFY_URL || "").trim();
  const serviceSecret = (env.KAIXU_SERVICE_SECRET || "").trim();
  if (!netlifyUrl || !serviceSecret) return;
  try {
    await fetch(`${netlifyUrl}/api/admin/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-kaixu-service": serviceSecret },
      body: JSON.stringify(data),
    });
  } catch (_) {
    // Swallow — logging must never affect the gate
  }
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
    ...(body.tools       ? { tools: body.tools }           : {}),
    ...(body.toolConfig  ? { toolConfig: body.toolConfig } : {}),
    // safetySettings intentionally NOT forwarded — gateway enforces its own safety posture.
    // Callers cannot disable content safety filters.
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };

  // KAIXU_CANON is always first and covers all identity + brand rules.
  // KAIXU_GLOBAL_SYSTEM should be left blank in env to avoid double-injection
  // that wastes tokens. Per-call system prompts (body.system) are additive on top.
  const sysText = [KAIXU_CANON, globalSystem, system].filter(Boolean).join("\n\n").trim();
  req.systemInstruction = { role: "system", parts: [{ text: sysText }] };

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

// ─── Embeddings handler ──────────────────────────────────────────────────────
// POST /v1/embeddings
// Body: { content: string | string[], model?: string, taskType?: string }
//   content       — one string or array of strings to embed
//   model         — optional, defaults to text-embedding-004
//   taskType      — optional Gemini taskType (RETRIEVAL_DOCUMENT, RETRIEVAL_QUERY,
//                   SEMANTIC_SIMILARITY, CLASSIFICATION, CLUSTERING, QUESTION_ANSWERING,
//                   FACT_VERIFICATION). Omit to let Gemini pick.
// Returns: { ok, model, embeddings: [ { index, values: float[] } ], usage: { totalTokens } }

async function handleEmbed(request, env, rid, ctx) {
  const t0 = Date.now();
  const cors = corsHeaders(request, env);
  const hdrs = { ...cors, "X-Request-ID": rid };

  const auth = await enforceAuth(request, env);
  if (!auth.ok) return jsonResp(auth.code, { ok: false, error: auth.message }, hdrs);

  const logBase = { requestId: rid, tokenId: auth.tokenId, tokenPrefix: auth.tokenPrefix, endpoint: "/v1/embeddings" };

  const key = (env.KAIXU_GEMINI_API_KEY || "").trim();
  if (!key) return jsonResp(500, { ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }, hdrs);

  const maxBytes = clampInt(env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = await request.text();
  if (rawBody.length > maxBytes) return jsonResp(413, { ok: false, error: `Body too large. Max ${maxBytes} bytes.` }, hdrs);

  let body;
  try { body = JSON.parse(rawBody); }
  catch (_) { return jsonResp(400, { ok: false, error: "Invalid JSON body." }, hdrs); }

  const requestedModel = String(body.model || "text-embedding-004").trim();
  if (!ALLOWED_EMBED_MODELS.has(requestedModel)) {
    return jsonResp(400, { ok: false, error: `Embedding model "${requestedModel}" is not available. Use: ${[...ALLOWED_EMBED_MODELS].join(", ")}.` }, hdrs);
  }
  const model = requestedModel;
  // Per-token model allowlist (set in admin dashboard — embed models checked separately)
  if (auth.allowedModels && auth.allowedModels.length > 0 && !auth.allowedModels.includes("embeddings") && !auth.allowedModels.includes(model)) {
    return jsonResp(403, { ok: false, error: "Your token is not authorized for embedding. Contact your administrator.", requestId: rid }, hdrs);
  }

  // Circuit breaker — fail fast if upstream is known down
  const cb = await checkCircuit(env);
  if (cb.open) {
    return jsonResp(503, { ok: false, error: "Upstream AI is temporarily unavailable. Try again in 30 seconds.", requestId: rid }, { ...hdrs, "Retry-After": "30" });
  }

  // Normalize content → always an array of strings
  const rawContent = body.content;
  if (rawContent == null) {
    return jsonResp(400, { ok: false, error: "Missing required field: content (string or string[])." }, hdrs);
  }
  const inputs = Array.isArray(rawContent)
    ? rawContent.map(String)
    : [String(rawContent)];

  if (!inputs.length || inputs.every(s => !s.trim())) {
    return jsonResp(400, { ok: false, error: "content must not be empty." }, hdrs);
  }

  const taskType = body.taskType || null;

  // Gemini supports batchEmbedContents for multiple inputs in one call.
  // For a single input use embedContent (slightly faster path).
  let upstream, upstreamJson;

  try {
    if (inputs.length === 1) {
      // Single embed
      const geminiBody = {
        model: `models/${model}`,
        content: { role: "user", parts: [{ text: inputs[0] }] },
        ...(taskType ? { taskType } : {}),
      };
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:embedContent`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(geminiBody) }
      );
      const text = await upstream.text();
      try { upstreamJson = JSON.parse(text); } catch (_) {}

      if (!upstream.ok) {
        const r = jsonResp(upstream.status, { ok: false, error: "Upstream embed error.", details: upstreamJson || { raw: text.slice(0, 4000) } }, hdrs);
        ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: upstream.status, durationMs: Date.now() - t0, error: "Upstream embed error" }));
        ctx.waitUntil(recordUpstreamFailure(env));
        return r;
      }

      const values = upstreamJson?.embedding?.values || [];
      const totalTokens = upstreamJson?.usageMetadata?.totalTokenCount || 0;
      const r = jsonResp(200, {
        ok: true, model: "kAIxU-embed",
        embeddings: [{ index: 0, values }],
        usage: { totalTokens },
      }, hdrs);
      ctx.waitUntil(fireLog(env, { ...logBase, model, totalTokens, statusCode: 200, durationMs: Date.now() - t0 }));
      return r;

    } else {
      // Batch embed
      const geminiBody = {
        requests: inputs.map(text => ({
          model: `models/${model}`,
          content: { role: "user", parts: [{ text }] },
          ...(taskType ? { taskType } : {}),
        })),
      };
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:batchEmbedContents`,
        { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(geminiBody) }
      );
      const text = await upstream.text();
      try { upstreamJson = JSON.parse(text); } catch (_) {}

      if (!upstream.ok) {
        const r = jsonResp(upstream.status, { ok: false, error: "Upstream batch embed error.", details: upstreamJson || { raw: text.slice(0, 4000) } }, hdrs);
        ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: upstream.status, durationMs: Date.now() - t0, error: "Upstream batch embed error" }));
        ctx.waitUntil(recordUpstreamFailure(env));
        return r;
      }

      const embeddings = (upstreamJson?.embeddings || []).map((e, i) => ({ index: i, values: e.values || [] }));
      const totalTokens = upstreamJson?.usageMetadata?.totalTokenCount || 0;
      const r = jsonResp(200, {
        ok: true, model: "kAIxU-embed",
        embeddings,
        usage: { totalTokens },
      }, hdrs);
      ctx.waitUntil(fireLog(env, { ...logBase, model, totalTokens, statusCode: 200, durationMs: Date.now() - t0 }));
      return r;
    }
  } catch (e) {
    const r = jsonResp(502, { ok: false, error: e.message || String(e) }, hdrs);
    ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: 502, durationMs: Date.now() - t0, error: e.message || String(e) }));
    ctx.waitUntil(recordUpstreamFailure(env));
    return r;
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleHealth(request, env, rid) {
  // Health requires auth — don't leak config state to anonymous callers
  const cors = corsHeaders(request, env);
  const hdrs = { ...cors, "X-Request-ID": rid };
  const auth = await enforceAuth(request, env);
  if (!auth.ok) return jsonResp(auth.code, { ok: false, error: auth.message }, hdrs);

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
  }, hdrs);
}

async function handleModels(request, env, rid) {
  const cors = corsHeaders(request, env);
  const hdrs = { ...cors, "X-Request-ID": rid };
  const models = [
    { id: "kAIxU-flash", label: "kAIxU Flash (fast, recommended)" },
    { id: "kAIxU-pro",   label: "kAIxU Pro (advanced reasoning, best quality)" },
  ];
  return jsonResp(200, {
    ok: true,
    defaultModel: "kAIxU-flash",
    models,
  }, hdrs);
}

async function handleGenerate(request, env, rid, ctx) {
  const t0 = Date.now();
  const cors = corsHeaders(request, env);
  const hdrs = { ...cors, "X-Request-ID": rid };

  const auth = await enforceAuth(request, env);
  if (!auth.ok) return jsonResp(auth.code, { ok: false, error: auth.message }, hdrs);

  const logBase = { requestId: rid, tokenId: auth.tokenId, tokenPrefix: auth.tokenPrefix, endpoint: "/v1/generate" };

  // Rate limit check
  const rl = await checkRateLimit(env, auth.token);
  if (!rl.ok) {
    return jsonResp(429, { ok: false, error: "Rate limit exceeded. Slow down." }, {
      ...hdrs, "Retry-After": String(rl.retryAfter),
    });
  }

  // Circuit breaker — fail fast if upstream is known down
  const cb = await checkCircuit(env);
  if (cb.open) {
    return jsonResp(503, { ok: false, error: "Upstream AI is temporarily unavailable. Try again in 30 seconds.", requestId: rid }, { ...hdrs, "Retry-After": "30" });
  }

  const key = (env.KAIXU_GEMINI_API_KEY || "").trim();
  if (!key) return jsonResp(500, { ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }, hdrs);

  const maxBytes = clampInt(env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = await request.text();
  if (rawBody.length > maxBytes) return jsonResp(413, { ok: false, error: `Body too large. Max ${maxBytes} bytes.` }, hdrs);

  let body;
  try { body = JSON.parse(rawBody); }
  catch (_) { return jsonResp(400, { ok: false, error: "Invalid JSON body." }, hdrs); }

  const requestedModel = String(body.model || env.KAIXU_DEFAULT_MODEL || "kAIxU-flash").trim();
  // Model allowlist — callers cannot request arbitrary models
  if (!ALLOWED_MODELS.has(requestedModel)) {
    return jsonResp(400, { ok: false, error: `Model "${requestedModel}" is not available through this gateway.` }, hdrs);
  }
  const model = MODEL_ALIASES[requestedModel] || requestedModel; // real Gemini name — never leaves worker
  const clientModel = MODEL_ALIASES[requestedModel] ? requestedModel : "kAIxU"; // branded name returned to callers
  // Per-token model allowlist (set in admin dashboard)
  if (auth.allowedModels && auth.allowedModels.length > 0) {
    if (!auth.allowedModels.includes(requestedModel) && !auth.allowedModels.includes(model)) {
      return jsonResp(403, { ok: false, error: `Your token is not authorized to use model "${requestedModel}". Contact your administrator.`, requestId: rid }, hdrs);
    }
  }

  const built = buildRequestBody(body, env);
  if (!built.ok) return jsonResp(400, { ok: false, error: built.error }, hdrs);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(built.value),
    });
  } catch (e) {
    const r = jsonResp(502, { ok: false, error: e.message || String(e) }, hdrs);
    ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: 502, durationMs: Date.now() - t0, error: e.message || String(e) }));
    ctx.waitUntil(recordUpstreamFailure(env));
    return r;
  }

  const text = await upstream.text();
  let upstreamJson = null;
  try { upstreamJson = JSON.parse(text); } catch (_) {}

  if (!upstream.ok) {
    const r = jsonResp(upstream.status, {
      ok: false,
      error: "Upstream model error.",
      details: upstreamJson || { raw: text.slice(0, 4000) },
    }, hdrs);
    ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: upstream.status, durationMs: Date.now() - t0, error: "Upstream model error" }));
    ctx.waitUntil(recordUpstreamFailure(env));
    return r;
  }

  const outText      = upstreamJson ? extractTextFromGemini(upstreamJson) : "";
  const usage        = upstreamJson ? extractUsage(upstreamJson)          : { promptTokens: 0, candidatesTokens: 0, thoughtsTokens: 0, totalTokens: 0 };
  const finishReason = upstreamJson ? extractFinishReason(upstreamJson)   : null;

  if (finishReason === "MAX_TOKENS" && !outText) {
    const r = jsonResp(200, {
      ok: false,
      error: "Model hit token limit before producing output. Increase maxOutputTokens (kAIxU Pro requires a larger budget).",
      model: clientModel, finishReason, usage,
    }, hdrs);
    ctx.waitUntil(fireLog(env, { ...logBase, model, ...usage, finishReason, statusCode: 200, durationMs: Date.now() - t0, error: "MAX_TOKENS" }));
    return r;
  }

  const includeRaw = !!body.includeRaw;
  const r = jsonResp(200, {
    ok: true,
    model: clientModel,
    text: outText,
    finishReason,
    usage,
    ...(includeRaw ? { raw: upstreamJson } : {}),
  }, hdrs);
  ctx.waitUntil(fireLog(env, { ...logBase, model, ...usage, finishReason, statusCode: 200, durationMs: Date.now() - t0 }));
  return r;
}

async function handleStream(request, env, rid, ctx) {
  const t0 = Date.now();
  const cors = corsHeaders(request, env);
  const hdrs = { ...cors, "X-Request-ID": rid };

  const auth = await enforceAuth(request, env);
  if (!auth.ok) return jsonResp(auth.code, { ok: false, error: auth.message }, hdrs);

  const logBase = { requestId: rid, tokenId: auth.tokenId, tokenPrefix: auth.tokenPrefix, endpoint: "/v1/stream" };

  // Rate limit check
  const rl = await checkRateLimit(env, auth.token);
  if (!rl.ok) {
    return jsonResp(429, { ok: false, error: "Rate limit exceeded. Slow down." }, {
      ...hdrs, "Retry-After": String(rl.retryAfter),
    });
  }

  // Circuit breaker — fail fast if upstream is known down
  const cb = await checkCircuit(env);
  if (cb.open) {
    return jsonResp(503, { ok: false, error: "Upstream AI is temporarily unavailable. Try again in 30 seconds.", requestId: rid }, { ...hdrs, "Retry-After": "30" });
  }

  const key = (env.KAIXU_GEMINI_API_KEY || "").trim();
  if (!key) return jsonResp(500, { ok: false, error: "Gateway misconfigured: KAIXU_GEMINI_API_KEY is not set." }, hdrs);

  const maxBytes = clampInt(env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);
  const rawBody = await request.text();
  if (rawBody.length > maxBytes) return jsonResp(413, { ok: false, error: `Body too large. Max ${maxBytes} bytes.` }, hdrs);

  let body;
  try { body = JSON.parse(rawBody); }
  catch (_) { return jsonResp(400, { ok: false, error: "Invalid JSON body." }, hdrs); }

  const requestedModel = String(body.model || env.KAIXU_DEFAULT_MODEL || "kAIxU-flash").trim();
  // Model allowlist
  if (!ALLOWED_MODELS.has(requestedModel)) {
    return jsonResp(400, { ok: false, error: `Model "${requestedModel}" is not available through this gateway.` }, hdrs);
  }
  const model = MODEL_ALIASES[requestedModel] || requestedModel; // real Gemini name — never leaves worker
  // Per-token model allowlist (set in admin dashboard)
  if (auth.allowedModels && auth.allowedModels.length > 0) {
    if (!auth.allowedModels.includes(requestedModel) && !auth.allowedModels.includes(model)) {
      return jsonResp(403, { ok: false, error: `Your token is not authorized to use model "${requestedModel}". Contact your administrator.`, requestId: rid }, hdrs);
    }
  }
  // Stream: SSE chunks are piped raw. Build customer UIs to display only .text content, not raw chunk JSON.

  // Always build through buildRequestBody — no raw passthrough.
  // body.request bypass was removed: it allowed KAIXU_CANON to be skipped entirely.
  const built = buildRequestBody(body, env);
  if (!built.ok) return jsonResp(400, { ok: false, error: built.error }, hdrs);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;

  let upstream;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(built.value),
    });
  } catch (e) {
    const r = jsonResp(502, { ok: false, error: e.message || String(e) }, hdrs);
    ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: 502, durationMs: Date.now() - t0, error: e.message || String(e) }));
    ctx.waitUntil(recordUpstreamFailure(env));
    return r;
  }

  if (!upstream.ok) {
    const errText = await upstream.text();
    let errJson = null;
    try { errJson = JSON.parse(errText); } catch (_) {}
    const r = jsonResp(upstream.status, {
      ok: false, error: "Upstream model error.",
      details: errJson || errText.slice(0, 4000),
    }, hdrs);
    ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: upstream.status, durationMs: Date.now() - t0, error: "Upstream model error" }));
    ctx.waitUntil(recordUpstreamFailure(env));
    return r;
  }

  // Log stream initiation — token counts unavailable (streamed, not buffered)
  ctx.waitUntil(fireLog(env, { ...logBase, model, statusCode: 200, durationMs: Date.now() - t0 }));

  // Pipe directly — Cloudflare Workers have no response timeout
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...cors,
      "X-Request-ID": rid,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const rid = reqId(); // generate first — needed even on crash

    try {
      const { method } = request;
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, "") || "/";
      const cors = corsHeaders(request, env);

      // CORS preflight — handle all OPTIONS immediately, no auth needed.
      // Browsers send this before every cross-origin POST. Must be instant.
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: { ...cors, "X-Request-ID": rid } });
      }

      // Router
      if (method === "GET"  && path === "/v1/health")      return handleHealth(request, env, rid);
      if (method === "GET"  && path === "/v1/models")      return handleModels(request, env, rid);
      if (method === "POST" && path === "/v1/generate")    return handleGenerate(request, env, rid, ctx);
      if (method === "POST" && path === "/v1/stream")      return handleStream(request, env, rid, ctx);
      if (method === "POST" && path === "/v1/embeddings")  return handleEmbed(request, env, rid, ctx);

      // Health also on root GET for browser / uptime monitors
      if (method === "GET" && (path === "/" || path === "")) return handleHealth(request, env, rid);

      return jsonResp(404, { ok: false, error: `No route for ${method} ${path}` }, { ...cors, "X-Request-ID": rid });

    } catch (err) {
      // ── Top-level error boundary ─────────────────────────────────────────
      // If ANY unhandled exception reaches here, we still return CORS headers.
      // Without this, the browser sees a CORS failure instead of the real error,
      // making it appear the AI is unreachable when it's actually a worker crash.
      console.error("[kAIxU] Unhandled worker error:", err?.message || String(err));
      return new Response(
        JSON.stringify({
          ok: false,
          error: "kAIxU encountered an unexpected error. Please try again.",
          requestId: rid,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Request-ID": rid,
            ...CORS_WILDCARD_FALLBACK,
          },
        }
      );
    }
  },
};
