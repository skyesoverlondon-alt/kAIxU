function brandConfig(env) {
  const company = String(env.KAIXU_COMPANY_NAME || "Skyes Over London").trim() || "Skyes Over London";
  const brain = String(env.KAIXU_BRAIN_NAME || "kAIxU S0L").trim() || "kAIxU S0L";
  const flashModel = String(env.KAIXU_BRAND_MODEL_FLASH || "kAIxU6.7-flash").trim() || "kAIxU6.7-flash";
  const proModel = String(env.KAIXU_BRAND_MODEL_PRO || "kAIxU6.7-pro").trim() || "kAIxU6.7-pro";
  const embedModel = String(env.KAIXU_BRAND_MODEL_EMBED || "kAIxU6.7-embed").trim() || "kAIxU6.7-embed";
  return { company, brain, flashModel, proModel, embedModel };
}

function providerModelConfig(env) {
  return {
    flash: String(env.KAIXU_PROVIDER_MODEL_FLASH || env.KAIXU_PROVIDER_MODEL || "gpt-4.1-mini").trim(),
    pro: String(env.KAIXU_PROVIDER_MODEL_PRO || env.KAIXU_PROVIDER_MODEL_FLASH || env.KAIXU_PROVIDER_MODEL || "gpt-4.1").trim(),
    embed: String(env.KAIXU_PROVIDER_MODEL_EMBED || "text-embedding-3-small").trim(),
  };
}

function defaultBrandModel(env) {
  const brand = brandConfig(env);
  const configured = String(env.KAIXU_DEFAULT_MODEL || "").trim();
  if (configured) return configured;
  return brand.flashModel;
}

function resolveTextModel(requested, env) {
  const brand = brandConfig(env);
  const provider = providerModelConfig(env);
  const incoming = String(requested || defaultBrandModel(env)).trim();

  const aliasToBrand = {
    [brand.flashModel]: brand.flashModel,
    [brand.proModel]: brand.proModel,
    "kAIxU6.7-flash": brand.flashModel,
    "kAIxU6.7-pro": brand.proModel,
    "kAIxU-flash": brand.flashModel,
    "kAIxU-pro": brand.proModel,
  };

  const brandedModel = aliasToBrand[incoming];
  if (!brandedModel) {
    return { ok: false, error: `Model not allowed: ${incoming}` };
  }

  const providerModel = brandedModel === brand.proModel ? provider.pro : provider.flash;
  return { ok: true, brandedModel, providerModel };
}

function resolveEmbedModel(requested, env) {
  const brand = brandConfig(env);
  const provider = providerModelConfig(env);
  const incoming = String(requested || brand.embedModel).trim();

  const allowed = new Set([brand.embedModel, "kAIxU6.7-embed", "kAIxU-embed"]);
  if (!allowed.has(incoming)) {
    return { ok: false, error: `Embedding model not allowed: ${incoming}` };
  }

  return { ok: true, brandedModel: brand.embedModel, providerModel: provider.embed };
}

function reqId() {
  return "req_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function csvToSet(raw) {
  return new Set(String(raw || "").split(",").map((s) => s.trim()).filter(Boolean));
}

function parseToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const xToken = request.headers.get("X-KAIXU-TOKEN") || "";
  return xToken.trim();
}

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function withMeta(rid) {
  return {
    "X-Request-ID": rid,
    "X-kAIxU-Version": "s0l-core-brain-v1",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, X-KAIXU-TOKEN, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function jsonResp(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

async function parseJson(request, maxBytes) {
  const raw = await request.text();
  if (raw.length > maxBytes) {
    return { ok: false, code: 413, error: `Body too large. Max ${maxBytes} bytes.` };
  }
  try {
    return { ok: true, value: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: false, code: 400, error: "Invalid JSON body." };
  }
}

function buildVerifyEndpoints(request, env) {
  const endpoints = [];

  const explicitEndpoint = String(env.KAIXU_TOKEN_VERIFY_URL || "").trim();
  if (explicitEndpoint) endpoints.push(explicitEndpoint);

  const addBase = (baseUrl) => {
    const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!normalized) return;
    endpoints.push(`${normalized}/api/admin/token/verify`);
  };

  const origin = String(request.headers.get("Origin") || "").trim();
  if (origin && /^https?:\/\//i.test(origin)) addBase(origin);

  const urlFromRequest = (() => {
    try { return new URL(request.url).origin; } catch { return ""; }
  })();
  if (urlFromRequest && /^https?:\/\//i.test(urlFromRequest)) addBase(urlFromRequest);

  const netlifyUrls = String(env.KAIXU_NETLIFY_URLS || "").split(",").map((u) => u.trim()).filter(Boolean);
  for (const base of netlifyUrls) addBase(base);

  const legacyBase = String(env.KAIXU_NETLIFY_URL || "").trim();
  if (legacyBase) addBase(legacyBase);

  const defaultBase = "https://kaixu67.skyesoverlondon.netlify.app";
  addBase(defaultBase);

  const seen = new Set();
  return endpoints.filter((endpoint) => {
    if (!endpoint || seen.has(endpoint)) return false;
    seen.add(endpoint);
    return true;
  });
}

async function enforceAuth(request, env) {
  const openGate = String(env.KAIXU_OPEN_GATE || "0") === "1";
  if (openGate) return { ok: true };

  const token = parseToken(request);
  if (!token) return { ok: false, code: 401, message: "Missing app token." };

  const serviceSecret = String(env.KAIXU_SERVICE_SECRET || env.KAIXUSI_SECRET || "").trim();
  if (serviceSecret) {
    const verifyEndpoints = buildVerifyEndpoints(request, env);
    for (const verifyEndpoint of verifyEndpoints) {
      try {
        const verify = await fetch(verifyEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-kaixu-service": serviceSecret,
          },
          body: JSON.stringify({ token }),
        });

        if (!verify.ok) continue;

        const data = await verify.json();
        if (!data.valid) {
          return {
            ok: false,
            code: 403,
            message: "Invalid app token." + (data.reason ? ` (${data.reason})` : ""),
          };
        }
        return {
          ok: true,
          token,
          tokenId: data.tokenId || null,
          tokenPrefix: data.tokenPrefix || (token.slice(0, 12) + "..."),
          allowedModels: Array.isArray(data.allowedModels) ? data.allowedModels : null,
        };
      } catch (error) {
        console.error("[auth] DB verify error against", verifyEndpoint, "falling back:", error?.message || String(error));
      }
    }
  }

  const allowed = csvToSet(env.KAIXU_APP_TOKENS || "");
  if (!allowed.size) return { ok: false, code: 500, message: "Gateway misconfigured: KAIXU_APP_TOKENS is empty." };
  if (!allowed.has(token)) return { ok: false, code: 403, message: "Invalid app token." };
  return { ok: true, token, tokenId: null, tokenPrefix: token.slice(0, 12) + "...", allowedModels: null };
}

function providerConfig(env) {
  const baseUrl = String(env.KAIXU_PROVIDER_BASE_URL || env.KAIXU_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const chatPath = String(env.KAIXU_PROVIDER_CHAT_PATH || "/chat/completions").trim();
  const embeddingsPath = String(env.KAIXU_PROVIDER_EMBEDDINGS_PATH || "/embeddings").trim();
  const apiKey = String(env.KAIXU_PROVIDER_API_KEY || env.KAIXU_OPENAI_API_KEY || env.OPENAI_KEY || "").trim();
  const authHeader = String(env.KAIXU_PROVIDER_AUTH_HEADER || "Authorization").trim();
  const authPrefix = String(env.KAIXU_PROVIDER_AUTH_PREFIX || "Bearer").trim();

  return {
    baseUrl,
    chatPath,
    embeddingsPath,
    apiKey,
    authHeader,
    authPrefix,
    keyConfigured: !!apiKey,
  };
}

function providerHeaders(cfg) {
  const headers = { "Content-Type": "application/json" };
  if (!cfg.apiKey) return headers;
  if (cfg.authPrefix) {
    headers[cfg.authHeader] = `${cfg.authPrefix} ${cfg.apiKey}`;
  } else {
    headers[cfg.authHeader] = cfg.apiKey;
  }
  return headers;
}

function mapInputToMessages(body, env) {
  const out = [];
  const globalSystem = String(env.KAIXU_GLOBAL_SYSTEM || "").trim();
  const reqSystem = String(body?.system || "").trim();
  const mergedSystem = [globalSystem, reqSystem].filter(Boolean).join("\n\n").trim();
  if (mergedSystem) out.push({ role: "system", content: mergedSystem });

  if (Array.isArray(body?.messages)) {
    for (const m of body.messages) {
      if (!m || !m.role) continue;
      const role = m.role === "model" ? "assistant" : String(m.role);
      if (role !== "system" && role !== "user" && role !== "assistant") continue;
      const content = m.content == null ? "" : String(m.content);
      if (content.trim()) out.push({ role, content });
    }
  }

  if (Array.isArray(body?.contents)) {
    for (const c of body.contents) {
      if (!c || !Array.isArray(c.parts)) continue;
      const role = c.role === "model" ? "assistant" : (c.role === "system" ? "system" : "user");
      const text = c.parts
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
      if (text) out.push({ role, content: text });
    }
  }

  if (body?.input && typeof body.input === "object") {
    const text = typeof body.input.content === "string" ? body.input.content : "";
    if (text.trim()) out.push({ role: "user", content: text.trim() });
  }

  return out;
}

async function upstreamJson(env, path, payload) {
  const cfg = providerConfig(env);
  if (!cfg.keyConfigured) {
    return { ok: false, status: 500, error: "Provider API key not configured." };
  }

  const timeoutMs = clampInt(env.KAIXU_TIMEOUT_MS, 1000, 120000, 25000);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: providerHeaders(cfg),
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) {
      return { ok: false, status: res.status, error: "Upstream model error." };
    }

    return { ok: true, status: 200, json };
  } catch (error) {
    const message = error?.name === "AbortError"
      ? "Upstream timeout."
      : "Upstream network error.";
    return { ok: false, status: 502, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function extractTextFromChat(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && part.type === "text")
      .map((part) => part.text || "")
      .join("");
  }
  return "";
}

function extractUsage(json) {
  const usage = json?.usage || {};
  return {
    promptTokens: Number(usage.prompt_tokens || 0),
    candidatesTokens: Number(usage.completion_tokens || 0),
    thoughtsTokens: 0,
    totalTokens: Number(usage.total_tokens || usage.prompt_tokens || 0),
  };
}

function smokeUiHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>kAIxU S0L Smoke UI</title>
  <style>
    :root {
      --bg:#0b0a14; --panel:#15132a; --line:#3b356a; --text:#f6f4ff;
      --muted:#c2bce8; --gold:#ffd55a; --ok:#35d39a; --bad:#ff6f6f; --violet:#b86bff;
    }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:14px/1.5 Inter,system-ui,sans-serif; }
    .wrap { max-width:980px; margin:20px auto; padding:0 16px 28px; }
    .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px; margin-bottom:12px; }
    h1 { margin:0 0 6px; color:var(--gold); font-size:22px; }
    .sub { color:var(--muted); font-size:12px; margin-bottom:8px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; }
    input, textarea, button, select {
      background:#0e0d1d; color:var(--text); border:1px solid #4b4387; border-radius:10px; padding:9px 10px; font:inherit;
    }
    input, textarea { flex:1; min-width:240px; }
    textarea { min-height:96px; }
    button { cursor:pointer; font-weight:700; border-color:#5e54a8; }
    button.primary { background:linear-gradient(180deg,#ffe08a,#ffd55a); color:#201400; border:none; }
    button:hover { filter:brightness(1.06); }
    .status { display:inline-block; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700; border:1px solid #5e54a8; }
    .ok { color:var(--ok); border-color:rgba(53,211,154,.45); background:rgba(53,211,154,.1); }
    .bad { color:var(--bad); border-color:rgba(255,111,111,.45); background:rgba(255,111,111,.1); }
    .neutral { color:var(--muted); }
    pre { margin:0; background:#0d0c1c; border:1px solid #453d7e; border-radius:10px; padding:10px; max-height:480px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>kAIxU S0L Built-in Smoke UI</h1>
      <div class="sub">No Netlify required. Open this worker URL and run smoke tests directly.</div>
      <div class="row" style="margin-bottom:8px">
        <input id="token" type="password" placeholder="App token (Bearer)" />
        <select id="model">
          <option value="kAIxU6.7-flash">kAIxU6.7-flash</option>
          <option value="kAIxU6.7-pro">kAIxU6.7-pro</option>
        </select>
      </div>
      <div class="row" style="margin-bottom:8px">
        <textarea id="prompt">Return exactly: S0L_SMOKE_OK</textarea>
      </div>
      <div class="row">
        <button class="primary" id="runAll">Run All Smoke Tests</button>
        <button id="healthBtn">Health</button>
        <button id="modelsBtn">Models</button>
        <button id="generateBtn">Generate</button>
        <button id="streamBtn">Stream</button>
        <button id="embBtn">Embeddings</button>
      </div>
      <div style="margin-top:8px">
        <span id="status" class="status neutral">Idle</span>
      </div>
    </div>

    <div class="card">
      <div class="sub">Output</div>
      <pre id="out">Ready.</pre>
    </div>
  </div>

  <script>
    const $ = (id) => document.getElementById(id);
    const tokenEl = $("token");
    const modelEl = $("model");
    const promptEl = $("prompt");
    const outEl = $("out");
    const statusEl = $("status");

    function setStatus(text, tone = "neutral") {
      statusEl.className = "status " + tone;
      statusEl.textContent = text;
    }

    function authHeaders(json = true) {
      const headers = {};
      const token = (tokenEl.value || "").trim();
      if (json) headers["Content-Type"] = "application/json";
      if (token) headers["Authorization"] = "Bearer " + token;
      return headers;
    }

    async function call(path, method = "GET", body = null) {
      const res = await fetch(path, {
        method,
        headers: authHeaders(Boolean(body)),
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch {}
      return { ok: res.ok, status: res.status, data };
    }

    function render(name, payload) {
      outEl.textContent = JSON.stringify({ test: name, ...payload }, null, 2);
      setStatus(name + ": " + (payload.ok ? "PASS" : "FAIL") + " (" + payload.status + ")", payload.ok ? "ok" : "bad");
    }

    async function testHealth() {
      const r = await call("/v1/health");
      render("health", r);
      return r;
    }

    async function testModels() {
      const r = await call("/v1/models");
      render("models", r);
      return r;
    }

    async function testGenerate() {
      const r = await call("/v1/generate", "POST", {
        model: modelEl.value,
        input: { type: "text", content: promptEl.value || "Return exactly: S0L_SMOKE_OK" },
      });
      render("generate", r);
      return r;
    }

    async function testEmbeddings() {
      const r = await call("/v1/embeddings", "POST", {
        content: "S0L smoke embeddings",
      });
      render("embeddings", r);
      return r;
    }

    async function testStream() {
      const res = await fetch("/v1/stream", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          model: modelEl.value,
          input: { type: "text", content: promptEl.value || "Return exactly: S0L_SMOKE_OK" },
        }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        const payload = { ok: false, status: res.status, error: text };
        render("stream", payload);
        return payload;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let doneSeen = false;
      let chunks = 0;
      let buffer = "";
      let textOut = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (raw === "[DONE]") {
            doneSeen = true;
            continue;
          }
          try {
            const chunk = JSON.parse(raw);
            const parts = chunk?.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (typeof part?.text === "string") textOut += part.text;
            }
            chunks += 1;
          } catch {}
        }
      }

      const payload = {
        ok: doneSeen && chunks > 0,
        status: 200,
        doneSeen,
        chunks,
        text: textOut,
      };
      render("stream", payload);
      return payload;
    }

    async function runAll() {
      setStatus("Running all tests...", "neutral");
      const report = { ok: true, tests: {}, at: new Date().toISOString() };
      try {
        report.tests.health = await testHealth();
        report.tests.models = await testModels();
        report.tests.generate = await testGenerate();
        report.tests.stream = await testStream();
        report.tests.embeddings = await testEmbeddings();
      } catch (error) {
        report.ok = false;
        report.error = String(error?.message || error);
      }

      report.ok = Object.values(report.tests).every((t) => t && t.ok);
      outEl.textContent = JSON.stringify(report, null, 2);
      setStatus(report.ok ? "All smoke tests PASS" : "Smoke tests FAIL", report.ok ? "ok" : "bad");
    }

    $("healthBtn").addEventListener("click", testHealth);
    $("modelsBtn").addEventListener("click", testModels);
    $("generateBtn").addEventListener("click", testGenerate);
    $("streamBtn").addEventListener("click", testStream);
    $("embBtn").addEventListener("click", testEmbeddings);
    $("runAll").addEventListener("click", runAll);
  </script>
</body>
</html>`;
}

async function handleHealth(env, rid) {
  const cfg = providerConfig(env);
  const brand = brandConfig(env);
  return jsonResp(200, {
    ok: true,
    requestId: rid,
    company: brand.company,
    brain: brand.brain,
    defaultModel: defaultBrandModel(env),
    openGate: String(env.KAIXU_OPEN_GATE || "0") === "1",
    keyConfigured: cfg.keyConfigured,
  }, withMeta(rid));
}

function handleModels(env, rid) {
  const brand = brandConfig(env);
  return jsonResp(200, {
    ok: true,
    requestId: rid,
    company: brand.company,
    brain: brand.brain,
    models: [
      { id: brand.flashModel, type: "text" },
      { id: brand.proModel, type: "text" },
      { id: brand.embedModel, type: "embedding" },
    ],
  }, withMeta(rid));
}

async function handleGenerate(body, env, rid) {
  const messages = mapInputToMessages(body || {}, env);
  if (!messages.length) {
    return jsonResp(400, { ok: false, error: "Missing input. Provide input.content, messages[], or contents[]." }, withMeta(rid));
  }

  const resolvedModel = resolveTextModel(body?.model, env);
  if (!resolvedModel.ok) {
    return jsonResp(400, { ok: false, error: resolvedModel.error }, withMeta(rid));
  }

  const upstream = await upstreamJson(env, providerConfig(env).chatPath, {
    model: resolvedModel.providerModel,
    messages,
    stream: false,
    temperature: Number.isFinite(Number(body?.generationConfig?.temperature))
      ? Number(body.generationConfig.temperature)
      : undefined,
    top_p: Number.isFinite(Number(body?.generationConfig?.topP))
      ? Number(body.generationConfig.topP)
      : undefined,
    max_tokens: Number.isFinite(Number(body?.generationConfig?.maxOutputTokens))
      ? Number(body.generationConfig.maxOutputTokens)
      : undefined,
  });

  if (!upstream.ok) {
    return jsonResp(upstream.status, { ok: false, error: upstream.error }, withMeta(rid));
  }

  return jsonResp(200, {
    ok: true,
    requestId: rid,
    model: resolvedModel.brandedModel,
    text: extractTextFromChat(upstream.json),
    finishReason: String(upstream.json?.choices?.[0]?.finish_reason || "STOP").toUpperCase(),
    usage: extractUsage(upstream.json),
  }, withMeta(rid));
}

async function handleEmbeddings(body, env, rid) {
  const content = body?.content;
  const validContent = typeof content === "string" || (Array.isArray(content) && content.every((item) => typeof item === "string"));
  if (!validContent) {
    return jsonResp(400, { ok: false, error: "Invalid content. Provide string or string[]." }, withMeta(rid));
  }

  const resolvedModel = resolveEmbedModel(body?.model, env);
  if (!resolvedModel.ok) {
    return jsonResp(400, { ok: false, error: resolvedModel.error }, withMeta(rid));
  }

  const upstream = await upstreamJson(env, providerConfig(env).embeddingsPath, {
    model: resolvedModel.providerModel,
    input: content,
  });

  if (!upstream.ok) {
    return jsonResp(upstream.status, { ok: false, error: upstream.error }, withMeta(rid));
  }

  const rows = Array.isArray(upstream.json?.data) ? upstream.json.data : [];
  const embeddings = rows.map((row, index) => ({
    index: Number(row?.index ?? index),
    values: Array.isArray(row?.embedding) ? row.embedding : [],
  }));

  return jsonResp(200, {
    ok: true,
    requestId: rid,
    model: resolvedModel.brandedModel,
    embeddings,
    usage: extractUsage(upstream.json),
  }, withMeta(rid));
}

async function handleStream(request, body, env, rid) {
  const messages = mapInputToMessages(body || {}, env);
  if (!messages.length) {
    return jsonResp(400, { ok: false, error: "Missing input. Provide input.content, messages[], or contents[]." }, withMeta(rid));
  }

  const resolvedModel = resolveTextModel(body?.model, env);
  if (!resolvedModel.ok) {
    return jsonResp(400, { ok: false, error: resolvedModel.error }, withMeta(rid));
  }

  const cfg = providerConfig(env);
  if (!cfg.keyConfigured) {
    return jsonResp(500, { ok: false, error: "Provider API key not configured." }, withMeta(rid));
  }

  let upstream;
  try {
    upstream = await fetch(`${cfg.baseUrl}${cfg.chatPath}`, {
      method: "POST",
      headers: providerHeaders(cfg),
      body: JSON.stringify({
        model: resolvedModel.providerModel,
        messages,
        stream: true,
      }),
    });
  } catch (error) {
    return jsonResp(502, { ok: false, error: error?.message || String(error) }, withMeta(rid));
  }

  if (!upstream.ok) {
    return jsonResp(upstream.status, { ok: false, error: "Upstream stream error." }, withMeta(rid));
  }

  if (!upstream.body) {
    return jsonResp(502, { ok: false, error: "Upstream returned no stream body." }, withMeta(rid));
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const transformed = new ReadableStream({
    async start(controller) {
      const reader = upstream.body.getReader();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const raw = trimmed.slice(5).trim();

            if (raw === "[DONE]") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              continue;
            }

            let chunk;
            try { chunk = JSON.parse(raw); } catch { continue; }

            const delta = chunk?.choices?.[0]?.delta;
            let text = "";
            if (typeof delta?.content === "string") {
              text = delta.content;
            } else if (Array.isArray(delta?.content)) {
              text = delta.content
                .filter((part) => part && part.type === "text")
                .map((part) => part.text || "")
                .join("");
            }

            if (!text) continue;

            const payload = {
              candidates: [
                {
                  content: {
                    parts: [{ text }],
                  },
                },
              ],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const payload = { ok: false, error: error?.message || String(error) };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(transformed, {
    status: 200,
    headers: {
      ...withMeta(rid),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

export default {
  async fetch(request, env) {
    const rid = reqId();
    const path = new URL(request.url).pathname;
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withMeta(rid) });
    }

    if (method === "GET" && path === "/v1/models") {
      return handleModels(env, rid);
    }

    if (method === "GET" && (path === "/" || path === "/smokehouse" || path === "/ui")) {
      return new Response(smokeUiHtml(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const auth = await enforceAuth(request, env);
    if (!auth.ok) {
      return jsonResp(auth.code, { ok: false, error: auth.message }, withMeta(rid));
    }

    if (method === "GET" && path === "/v1/health") {
      return handleHealth(env, rid);
    }

    const maxBytes = clampInt(env.KAIXU_MAX_BODY_BYTES, 1024, 16_000_000, 5_242_880);

    if (method === "POST" && path === "/v1/generate") {
      const parsed = await parseJson(request, maxBytes);
      if (!parsed.ok) return jsonResp(parsed.code, { ok: false, error: parsed.error }, withMeta(rid));
      return handleGenerate(parsed.value || {}, env, rid);
    }

    if (method === "POST" && path === "/v1/stream") {
      const parsed = await parseJson(request, maxBytes);
      if (!parsed.ok) return jsonResp(parsed.code, { ok: false, error: parsed.error }, withMeta(rid));
      return handleStream(request, parsed.value || {}, env, rid);
    }

    if (method === "POST" && path === "/v1/embeddings") {
      const parsed = await parseJson(request, maxBytes);
      if (!parsed.ok) return jsonResp(parsed.code, { ok: false, error: parsed.error }, withMeta(rid));
      return handleEmbeddings(parsed.value || {}, env, rid);
    }

    return jsonResp(404, { ok: false, error: "Not found." }, withMeta(rid));
  },
};
