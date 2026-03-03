#!/usr/bin/env node
import process from "node:process";

const base = (process.env.KAIXU_BASE_URL || "http://127.0.0.1:8701").replace(/\/$/, "");
const token = (process.env.KAIXU_TOKEN || "").trim();
const timeoutMs = Number(process.env.KAIXU_CONTRACT_TIMEOUT_MS || 30000);

function headers(json = false) {
  const h = {};
  if (json) h["content-type"] = "application/json";
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function req(path, method = "GET", body = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: headers(Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function testHealth() {
  const r = await req("/v1/health");
  assert(r.ok, `health failed status=${r.status}`);
  assert(r.data && r.data.ok === true, "health shape invalid: expected ok=true");
}

async function testModels() {
  const r = await req("/v1/models");
  assert(r.ok, `models failed status=${r.status}`);
  assert(Array.isArray(r.data?.models), "models shape invalid: expected models[]");
}

async function testGenerate() {
  const r = await req("/v1/generate", "POST", {
    model: "kAIxU6.7-flash",
    input: { type: "text", content: "Return exactly: CONTRACT_OK" },
    temperature: 0,
    maxOutputTokens: 32,
  });
  assert(r.ok, `generate failed status=${r.status}`);
  const topLevelText = typeof r.data?.text === "string" && r.data.text.trim().length > 0;
  const candidateText = Array.isArray(r.data?.candidates)
    && r.data.candidates.length > 0
    && typeof r.data.candidates[0]?.content?.parts?.[0]?.text === "string";
  assert(topLevelText || candidateText, "generate shape invalid: expected text or candidates[].content.parts[].text");
}

async function testSmokeLog() {
  const r = await req("/v1/admin/smoke/log");
  assert(r.ok, `smoke log failed status=${r.status}`);
  assert(r.data && r.data.ok === true, "smoke log shape invalid: expected ok=true");
}

async function testStream() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/v1/stream`, {
      method: "POST",
      headers: headers(true),
      body: JSON.stringify({
        model: "kAIxU6.7-flash",
        input: { type: "text", content: "Return exactly: STREAM_OK" },
      }),
      signal: controller.signal,
    });

    assert(res.ok, `stream failed status=${res.status}`);
    assert(res.body, "stream shape invalid: missing response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let doneSeen = false;
    let chunks = 0;
    let buffer = "";

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
          const obj = JSON.parse(raw);
          if (obj?.candidates?.[0]?.content?.parts) chunks += 1;
        } catch {}
      }
      if (doneSeen && chunks > 0) break;
    }

    assert(doneSeen, "stream contract invalid: missing [DONE]");
    assert(chunks > 0, "stream contract invalid: no candidate chunks");
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const tests = [
    ["health", testHealth],
    ["models", testModels],
    ["generate", testGenerate],
    ["stream", testStream],
    ["smoke-log", testSmokeLog],
  ];

  console.log(`[contract-test] base=${base}`);
  for (const [name, fn] of tests) {
    const started = Date.now();
    await fn();
    console.log(`[contract-test] pass ${name} (${Date.now() - started}ms)`);
  }
  console.log("[contract-test] PASS");
}

main().catch((error) => {
  console.error("[contract-test] FAIL", error?.message || error);
  process.exit(1);
});
