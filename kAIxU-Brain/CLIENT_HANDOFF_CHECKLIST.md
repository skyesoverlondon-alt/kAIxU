# Client Handoff Checklist — kAIxU-Brain

Use this checklist when delivering this brain folder to another developer or client team.

## 1) Delivery Package

- [ ] Share the complete `kAIxU-Brain/` folder
- [ ] Include `.dev.vars.template` only (never real secrets)
- [ ] Include this checklist and `README.md`
- [ ] Confirm `wrangler.toml` is present in folder root

## 2) Cloudflare Setup (Git Deploy)

- [ ] Connect repo: `skyesoverlondon-alt/kAIxU`
- [ ] Branch: `main`
- [ ] Root directory: `kAIxU-Brain`
- [ ] Framework preset: None
- [ ] Build command: `npm ci`
- [ ] Deploy command: `npx wrangler deploy --config wrangler.toml`
- [ ] If runner requires single script, use:
	- [ ] `cd kAIxU-Brain && npm ci && npx wrangler deploy --config wrangler.toml`

## 3) Required Environment Variables / Secrets

- [ ] Secret: `OPENAI_KEY`
- [ ] Secret: `KAIXUSI_SECRET`
- [ ] KV binding: `KAIXU_SMOKE_KV`

Common optional vars:

- [ ] `KAIXU_APP_TOKENS` (fallback auth only)
- [ ] `KAIXU_ALLOWED_ORIGINS`
- [ ] `KAIXU_GLOBAL_SYSTEM` (recommended blank when canon is enforced)

Not required by this worker runtime:

- [ ] `DATABASE_URL`
- [ ] `GEMINI_KEY`

## 4) Smoke Validation (Worker-Hosted UI)

- [ ] Open worker URL root `/`
- [ ] Open `/smokehouse`
- [ ] Run health/models/generate/stream/embeddings checks
- [ ] Confirm auth-protected endpoints succeed with gate token

## 5) API Contract Validation

- [ ] `GET /v1/health` (auth required)
- [ ] `GET /v1/models` (public)
- [ ] `POST /v1/generate` (auth required)
- [ ] `POST /v1/stream` (auth required)
- [ ] `POST /v1/embeddings` (auth required)

## 6) Security / Release Guardrails

- [ ] No provider keys committed to git
- [ ] No gate tokens committed to git
- [ ] Model allowlist policy confirmed
- [ ] Token rotation/revocation process documented

## 7) Client Acceptance Signoff

- [ ] Deployed worker URL provided
- [ ] Working gate token provided through secure channel
- [ ] Smoke screenshots/logs shared
- [ ] Support owner + escalation contact documented

---

## One-line Handoff Statement

This folder is a standalone deployable brain worker: add credentials, deploy to Cloudflare, and validate via built-in smoke UI.
