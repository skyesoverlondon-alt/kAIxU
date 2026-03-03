# Client Handoff Checklist — kAIxU S0L Core Brain

Use this checklist when delivering this brain folder to another developer or client team.

## 1) Delivery Package

- [ ] Share the complete `kAIxU-S0L-Core-Brain/` folder
- [ ] Include `.dev.vars.template` only (never real secrets)
- [ ] Include this checklist and `README.md`
- [ ] Confirm `wrangler.toml` is present in folder root

## 2) Cloudflare Setup (Git Deploy)

- [ ] Connect repo: `skyesoverlondon-alt/kAIxU`
- [ ] Branch: `main`
- [ ] Root directory: `kAIxU-S0L-Core-Brain`
- [ ] Framework preset: None
- [ ] Build command: *(leave empty)*
- [ ] Deploy command: `npx wrangler deploy`

## 3) Required Environment Variables / Secrets

- [ ] `KAIXU_APP_TOKENS` (or DB-backed auth stack)
- [ ] `KAIXU_PROVIDER_NAME`
- [ ] `KAIXU_PROVIDER_BASE_URL`
- [ ] `KAIXU_PROVIDER_CHAT_PATH`
- [ ] `KAIXU_PROVIDER_AUTH_HEADER`
- [ ] `KAIXU_PROVIDER_AUTH_PREFIX`
- [ ] Provider credential secret (example: API key)

Optional / common:

- [ ] `KAIXU_PROVIDER_EMBEDDINGS_PATH`
- [ ] `KAIXU_MAX_BODY_BYTES`
- [ ] `KAIXU_GLOBAL_SYSTEM` (recommended blank when canon is enforced)

## 4) Smoke Validation (Worker-Hosted UI)

- [ ] Open worker URL root `/`
- [ ] Open `/smokehouse`
- [ ] Run health test
- [ ] Run models test
- [ ] Run generate test
- [ ] Run stream test
- [ ] Run embeddings test

## 5) API Contract Validation

- [ ] `GET /v1/health` (auth required)
- [ ] `GET /v1/models` (public)
- [ ] `POST /v1/generate` (auth required)
- [ ] `POST /v1/stream` (auth required)
- [ ] `POST /v1/embeddings` (auth required)

## 6) Security / Release Guardrails

- [ ] No provider keys committed to git
- [ ] No gate tokens committed to git
- [ ] Client understands token rotation/revocation process
- [ ] Model allowlist policy confirmed

## 7) Client Acceptance Signoff

- [ ] Deployed worker URL provided
- [ ] Working gate token provided through secure channel
- [ ] Smoke screenshots/logs shared
- [ ] Support owner + escalation contact documented

---

## One-line Handoff Statement

This folder is a standalone deployable brain worker: add credentials, deploy to Cloudflare, and validate via built-in smoke UI.
