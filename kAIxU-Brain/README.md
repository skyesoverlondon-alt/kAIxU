# kAIxU-Brain (Stage 1)

Second AI brain scaffold for kAIxU, implemented as a standalone Cloudflare Worker.

## Goals

- Keep existing app and Gate routing untouched.
- Mirror current kAIxU gateway contract:
  - `GET /v1/health`
  - `GET /v1/models`
  - `POST /v1/generate`
  - `POST /v1/stream`
  - `POST /v1/embeddings`
- Use Skyes Over London as the provider brand for all exposed responses.
- Make provider swapping isolated to alias/env sections in `src/index.js`.

## Quick start

1. Install dependencies:
   - `npm install`
2. Create local secrets:
   - `cp .dev.vars.template .dev.vars`
   - set `KAIXU_OPENAI_API_KEY` and `KAIXU_APP_TOKENS`
   - set `KAIXU_SERVICE_SECRET` (or `KAIXUSI_SECRET`) for centralized gate-managed token verification
   - optional: `KAIXU_TOKEN_VERIFY_URL` or `KAIXU_NETLIFY_URLS` for explicit multi-gate routing
3. Run locally:
   - `npm run dev`
4. Deploy:
   - `npm run deploy`

## Cloudflare Git Deploy (Required Settings)

Use these exact settings for this folder:

- Root directory: `kAIxU-Brain`
- Build command: `npm ci`
- Deploy command: `npx wrangler deploy --config wrangler.toml`

If your runner uses a single script step, use:

```bash
#!/usr/bin/env bash
set -euo pipefail

cd kAIxU-Brain
npm ci
npx wrangler deploy --config wrangler.toml
```

### Minimal Secrets for kaixusi Core Deploy

For your current central gate architecture, set these secrets:

- `OPENAI_KEY` (provider key; internal compatibility variable)
- `KAIXUSI_SECRET`

Also required (non-secret):

- KV binding `KAIXU_SMOKE_KV`

Notes:

- `DATABASE_URL` and `GEMINI_KEY` are not required by this worker runtime.
- `KAIXU_APP_TOKENS` is optional fallback only (used if central verify is unavailable).

## Client Delivery

- Use `CLIENT_HANDOFF_CHECKLIST.md` for turnkey transfer/deployment handoff.

## Notes

- Client request/response shape matches your current gate contract.
- Streaming endpoint emits Gemini-like SSE chunks (`candidates[].content.parts[].text`) so existing stream parsers continue to work.
- Minimal UI is served at `GET /` for quick smoke tests.
- Auth path: auto-discovers admin verify endpoints (`/api/admin/token/verify`) across origins/configured URLs; falls back to `KAIXU_APP_TOKENS` if the admin service is unavailable.

## Smoke House

- Admin UI route: `GET /smokehouse`
- Admin API routes:
   - `GET /v1/admin/smoke/audit`
   - `GET /v1/admin/smoke/endpoints`
   - `GET /v1/admin/smoke/log`
   - `POST /v1/admin/smoke/run`
   - `GET /v1/admin/brains`
   - `POST /v1/admin/brains/resolve`
- Smoke is runtime-only (KV + worker logs), with no local file artifact dependency.

## Automated Smoke + Health

- Cron cadence: every 3 minutes (`*/3 * * * *`) via Worker `scheduled()`.
- Toggle off automated runs: set `KAIXU_SMOKE_AUTORUN=0`.
- Keep manual-only smoke: use `POST /v1/admin/smoke/run`.
- Autorun generate ping toggle: `KAIXU_SMOKE_AUTORUN_GENERATE=0|1`.
- Runtime log persistence: bind `KAIXU_SMOKE_KV`.

## Brain Selector Registry

- Primary live brain: `kAIxU6.7` (`kaixu67`, Delta Gate)
- Secondary brain: `kAIxU0s` (`kaixu0s`, this Skyes Over London branded brain)
- Third brain: `skAIxU Flow 3.2` (`flow32`)
- Registry endpoint: `GET /v1/admin/brains`
- Resolver endpoint: `POST /v1/admin/brains/resolve` with body `{ "target": "kaixu67|kaixu0s|flow32" }`
- Backward compatibility: legacy target IDs `core67` and `coresi4` are still accepted and mapped to `kaixu67` and `kaixu0s`.
- Deprecation notice: use `kaixu67` and `kaixu0s` for all new integrations; legacy IDs remain supported for existing clients.
- Selector is env-driven and does not reroute existing apps automatically.

## Enterprise Buildout (1-12)

- Master roadmap: `docs/enterprise/README.md`
- Workstreams: `docs/enterprise/01-reliability-slos.md` through `docs/enterprise/12-load-chaos-drills.md`
- Operational artifacts: `ops/slo`, `ops/compliance`, `ops/governance`, `ops/release`, `ops/runbooks`
- Dashboard spec: `observability/dashboards/admin-audit-dashboard.json`

### Enterprise Commands

- `npm run smoke:verify`
- `npm run contract:test`
- `npm run quality:gates`
- `npm run quality:gates:static`

### CI

- Workflow: `.github/workflows/quality-gates.yml`
- `static-gates` always runs.
- `live-gates` runs when `KAIXU_STAGE_BASE_URL` secret is configured.
