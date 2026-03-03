# kAIxu Gate Delta

**Skyes Over London LC** — API gateway that keeps your model API key server-side.  
Your apps call the gate, the gate handles the rest. The key never leaves the server.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/health` | Gateway status |
| `GET` | `/v1/models` | Available models |
| `POST` | `/v1/generate` | Non-streaming generation |
| `POST` | `/v1/stream` | True SSE streaming (no buffering) |

---

## Deployments

### ① Cloudflare Workers (recommended — no timeout on streaming)

**Auto-deploy on every push via GitHub Actions — no terminal needed after initial setup.**

**Step 1 — Cloudflare API Token:**
1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**
2. Use the **"Edit Cloudflare Workers"** template
3. Copy the token

**Step 2 — Cloudflare Account ID:**
1. Cloudflare dashboard → **Workers & Pages → Overview**
2. Copy your **Account ID** from the right sidebar

**Step 3 — Add secrets to GitHub:**
- GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
  - `CF_API_TOKEN` → your Cloudflare API token
  - `CF_ACCOUNT_ID` → your Cloudflare account ID

**Step 4 — Add env vars to Cloudflare:**
- Cloudflare dashboard → **Workers & Pages → kaixu67 → Settings → Variables → Add variable**
  - `KAIXU_GEMINI_API_KEY` (mark as encrypted)
  - `KAIXU_APP_TOKENS` (mark as encrypted, comma-separated)

**Step 5 — Deploy:**  
Push any change to `worker/` on `main` → GitHub Actions auto-deploys. Done.

**Worker URL:** `https://kaixu67.skyesoverlondon.workers.dev`

---

### ② Netlify (live — 26s streaming timeout on paid plan)

Deploys automatically from this repo via Netlify Git integration. No build command needed.

Netlify now proxies `/v1/*` AI contract routes to Cloudflare Worker upstream, so Netlify no longer needs direct model provider API keys for those `/v1/*` routes.

**Set these in Netlify → Site configuration → Environment variables:**
- `KAIXU_V1_UPSTREAM` (recommended, example: `https://kaixu67.skyesoverlondon.workers.dev`)
- `KAIXU_APP_TOKENS` (required for Netlify-side gate/admin functions)
- Optional: `KAIXU_DEFAULT_MODEL`, `KAIXU_ALLOWED_ORIGINS`, `KAIXU_GLOBAL_SYSTEM`, `KAIXU_LOG_LEVEL`, `KAIXU_MAX_BODY_BYTES`, `KAIXU_TIMEOUT_MS`

### Netlify envs for new live gate deploys (`kaixu0s.netlify.app`)

Use this baseline:

- Required for gateway generation:
  - `KAIXU_V1_UPSTREAM` (Cloudflare worker origin; AI is handled there)
  - `KAIXU_APP_TOKENS`
- Strongly recommended defaults:
  - `KAIXU_DEFAULT_MODEL`
  - `KAIXU_OPEN_GATE=0`
  - `KAIXU_MAX_BODY_BYTES`
  - `KAIXU_TIMEOUT_MS`
  - `KAIXU_ALLOWED_ORIGINS`
  - `KAIXU_GLOBAL_SYSTEM`
  - `KAIXU_LOG_LEVEL`
- Required for central brain→gate trust (new brain onboarding):
  - `KAIXU_SERVICE_SECRETS` (comma-separated list; preferred)
  - or `KAIXU_SERVICE_SECRET` (single legacy value)
- Required for DB-backed admin token verify / admin logs:
  - `NEON_DATABASE_URL` **or** `NETLIFY_DATABASE_URL`

Notes:

- `NETLIFY_DATABASE_URL_UNPOOLED` is optional fallback.
- For each new brain, append its service secret to `KAIXU_SERVICE_SECRETS` (do not replace existing secrets).

See `ENV.template` for the full list.

---

## Calling the gateway

```js
const res = await fetch("https://kaixu67.skyesoverlondon.workers.dev/v1/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_APP_TOKEN"
  },
  body: JSON.stringify({
    model: "kAIxU6.7-flash",
    input: { type: "text", content: "Hello" },
    generationConfig: { temperature: 0.7 }
  })
});
const data = await res.json();
console.log(data.text);
```

### Request body fields

| Field | Type | Description |
|-------|------|-------------|
| `model` | string | Defaults to `KAIXU_DEFAULT_MODEL` |
| `input` | `{ type: "text", content: "..." }` | Simple text prompt |
| `messages` | array | Role/content message array `[{ role, content }]` — auto-converted |
| `contents` | array | Raw `contents[]` — passed through directly |
| `system` | string | Per-request system instruction |
| `generationConfig` | object | Passed through verbatim (temperature, maxOutputTokens, etc.) |
| `output` | `{ format: "json"|"text"|"markdown" }` | Sets `responseMimeType` |
| `safetySettings` | array | Passed through |
| `tools` / `toolConfig` | object | Passed through |
| `includeRaw` | boolean | Include raw model response at `raw` |

### Response

```json
{
  "ok": true,
  "model": "kAIxU6.7-flash",
  "text": "...",
  "finishReason": "STOP",
  "usage": {
    "promptTokens": 12,
    "candidatesTokens": 80,
    "thoughtsTokens": 0,
    "totalTokens": 92
  }
}
```

> **Note on `kAIxU6.7-pro`:** This is a thinking model — it burns tokens internally before producing output. If you get `text: ""` or `finishReason: "MAX_TOKENS"`, pass a higher `maxOutputTokens` in `generationConfig` (e.g. `65536`).

---

## Streaming (SSE)

```js
const res = await fetch("https://kaixu67.skyesoverlondon.workers.dev/v1/stream", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_APP_TOKEN"
  },
  body: JSON.stringify({
    model: "kAIxU6.7-flash",
    input: { type: "text", content: "Tell me a story" }
  })
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  for (const line of chunk.split("\n")) {
    if (line.startsWith("data: ")) {
      const json = JSON.parse(line.slice(6));
      const text = json.candidates?.[0]?.content?.parts
        ?.filter(p => !p.thought)
        ?.map(p => p.text || "")
        ?.join("") || "";
      process.stdout.write(text);
    }
  }
}
```

---

## Security

- Model API key is never returned to callers
- All requests require `Authorization: Bearer <token>` matching `KAIXU_APP_TOKENS`
- Lock to specific origins via `KAIXU_ALLOWED_ORIGINS`
- Set `KAIXU_OPEN_GATE=1` only for internal/trusted environments
