# Kaixu Gate Delta (Netlify Gateway)

This repo deploys **Kaixu Gate Delta** — a Netlify-hosted API gateway that keeps your **Gemini API key** locked inside the gateway as an environment variable, so your other apps never touch it.

Your apps call:
- `POST https://<your-gateway-site>.netlify.app/v1/generate`
- (optional) `POST https://<your-gateway-site>.netlify.app/v1/stream` (SSE streaming)
- `GET  https://<your-gateway-site>.netlify.app/v1/health`
- `GET  https://<your-gateway-site>.netlify.app/v1/models`

## Important deployment note

This gateway uses **Netlify Functions**.  
**Lord kAIxu, this must be deployed via Git or it will not be useful to you.**

Drag-and-drop deployments often skip proper function packaging / routing.

## 1) Deploy (Git)

1. Create a new GitHub repo (private is fine).
2. Upload this whole folder to the repo.
3. In Netlify: **Add new site → Import from Git** → pick the repo.
4. Build settings: no special build command needed (static publish + functions).

## 2) Set your environment variables

In Netlify: **Site configuration → Environment variables**, set:

- `KAIXU_GEMINI_API_KEY` (required)
- `KAIXU_APP_TOKENS` (required; comma-separated)
- Optional: `KAIXU_DEFAULT_MODEL`, `KAIXU_ALLOWED_ORIGINS`, etc.

Use `ENV.template` as your checklist.

## 3) Call it from your apps (client-side)

Example (browser):

```js
const res = await fetch("https://YOUR-GATE.netlify.app/v1/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_APP_TOKEN"
  },
  body: JSON.stringify({
    model: "gemini-2.5-flash",
    input: { type: "text", content: "Write a product overview in 5 bullet points." },
    output: { format: "markdown", style: "brand-neutral" },
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
  })
});

const data = await res.json();
console.log(data.text);
```

## 4) Request format (what your apps send)

Minimum:

```json
{
  "input": { "type": "text", "content": "Hello" }
}
```

Supported fields:
- `model` (string) — defaults to `KAIXU_DEFAULT_MODEL`
- `system` (string) — per-request system instruction
- `input` (object) — `{ type: "text", content: "..." }`
- `contents` (array) — raw Gemini `contents[]` if you want full control
- `messages` (array) — OpenAI-style messages; converted to Gemini format
- `generationConfig` (object) — forwarded to Gemini
- `safetySettings`, `tools`, `toolConfig` — forwarded to Gemini
- `output` (object) — convenience; supports `{ format: "json"|"text"|"markdown" }` and sets `responseMimeType`

## 5) Response format

```json
{
  "ok": true,
  "text": "…",
  "model": "gemini-2.5-flash",
  "usage": { "promptTokens": 0, "candidatesTokens": 0, "totalTokens": 0 },
  "raw": { "...": "optional if includeRaw=true" }
}
```

## Security model (simple + effective)

- The Gemini key is never returned.
- Apps must supply an app token (`Authorization: Bearer ...`) that matches `KAIXU_APP_TOKENS`.
- You can lock calls to known origins via `KAIXU_ALLOWED_ORIGINS`.
