# kAIxU S0L Core Brain

Core brain workspace for the kAIxU S0L stack.

## Deployment Model (kAIxU0s-style)

This project is designed to be spun up almost exactly like the kAIxU0s brain:

- Create a new Cloudflare Worker from this folder
- Set gate token env (`KAIXU_APP_TOKENS` or open-gate mode)
- Set provider credentials/env (API key, base URL, paths)
- Deploy

That means new brain instances are mostly configuration, not rewrite.

## Built-in Smoke UI (No Netlify Required)

This brain ships with a smoke UI served by the worker itself:

- `GET /` → smoke UI
- `GET /smokehouse` → smoke UI

So even if you never host a Netlify UI, you can open the worker URL and run smoke tests directly.

## Purpose

This project is the new Cloudflare Worker brain baseline for:

- Gateway-enforced AI generation
- Health and model discovery endpoints
- Smoke-first reliability workflows
- Investor/client trust hardening over time

## Initial Scope (MVP)

- Worker routes:
  - `GET /v1/health`
  - `GET /v1/models`
  - `POST /v1/generate`
   - `POST /v1/stream`
   - `POST /v1/embeddings`
- Token gate via bearer auth
- Deterministic JSON response envelope

## Quick Start

1. Install deps:

   npm ci

2. Add local secret file:

   cp .dev.vars.template .dev.vars

3. Set required values in `.dev.vars`:

   - `KAIXU_APP_TOKENS`
   - `KAIXU_SERVICE_SECRET` (or `KAIXUSI_SECRET`) for centralized token authority
   - optional: `KAIXU_TOKEN_VERIFY_URL` or `KAIXU_NETLIFY_URLS` for explicit multi-gate routing
   - `KAIXU_PROVIDER_API_KEY`
   - `KAIXU_PROVIDER_BASE_URL`
   - `KAIXU_PROVIDER_MODEL_FLASH`
   - `KAIXU_PROVIDER_MODEL_PRO`
   - `KAIXU_PROVIDER_MODEL_EMBED`

4. Optional provider auth overrides:

   - `KAIXU_PROVIDER_AUTH_HEADER`
   - `KAIXU_PROVIDER_AUTH_PREFIX`
   - `KAIXU_PROVIDER_CHAT_PATH`
   - `KAIXU_PROVIDER_EMBEDDINGS_PATH`

5. Optional brand-facing model IDs (client-visible):

   - `KAIXU_COMPANY_NAME`
   - `KAIXU_BRAND_MODEL_FLASH`
   - `KAIXU_BRAND_MODEL_PRO`
   - `KAIXU_BRAND_MODEL_EMBED`

6. Run locally:

   npm run dev

7. Smoke check:

   curl http://127.0.0.1:8787/v1/health -H "Authorization: Bearer YOUR_TOKEN"

## Client Delivery

Use `CLIENT_HANDOFF_CHECKLIST.md` for turnkey transfer/deployment handoff.

## Endpoint Contract

- `GET /` (built-in smoke UI)
- `GET /smokehouse` (built-in smoke UI)
- `GET /v1/health` (auth required)
- `GET /v1/models` (public)
- `POST /v1/generate` (auth required)
- `POST /v1/stream` (auth required, SSE)
- `POST /v1/embeddings` (auth required)

## Central Token Authority (Recommended)

- Set `KAIXU_SERVICE_SECRET` (or `KAIXUSI_SECRET`) to enable centralized verify calls.
- S0L auto-discovers verify endpoints (`/api/admin/token/verify`) across request origin, configured URL list, and defaults.
- Optional explicit routing: `KAIXU_TOKEN_VERIFY_URL` or `KAIXU_NETLIFY_URLS`.
- If that service is temporarily unavailable, S0L falls back to `KAIXU_APP_TOKENS` so the brain remains available.

## Provider Compatibility

S0L uses an OpenAI-compatible upstream contract by default. For most providers, bootstrapping is:

- set `KAIXU_PROVIDER_BASE_URL`
- set `KAIXU_PROVIDER_API_KEY`
- set auth header/prefix if non-standard

No route rewrites needed unless the provider is not OpenAI-compatible.

## Brand Masking Standard (Mandatory)

- Client-facing responses only return branded IDs (`KAIXU_BRAND_MODEL_*`).
- Provider model IDs are mapped internally via `KAIXU_PROVIDER_MODEL_*` and are never returned by `/v1/models`, `/v1/generate`, `/v1/stream`, or `/v1/embeddings` responses.
- This keeps provider identity abstracted so the brain remains a branded product surface.

## Project Layout

- `src/` worker source
- `docs/` project and architecture docs
- `ops/` runbooks and governance notes
- `scripts/` helper scripts for future automation
