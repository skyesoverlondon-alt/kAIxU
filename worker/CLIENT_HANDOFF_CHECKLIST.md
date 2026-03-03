# Client Handoff Checklist — worker (Legacy Brain)

Use this checklist when delivering this brain folder to another developer or client team.

## 1) Delivery Package

- [ ] Share the complete `worker/` folder
- [ ] Include `.dev.vars.template` only (never real secrets)
- [ ] Include this checklist
- [ ] Confirm `wrangler.toml` is present in folder root

## 2) Cloudflare Setup (Git Deploy)

- [ ] Connect repo: `skyesoverlondon-alt/kAIxU`
- [ ] Branch: `main`
- [ ] Root directory: `worker`
- [ ] Framework preset: None
- [ ] Build command: *(leave empty)*
- [ ] Deploy command: `npx wrangler deploy`

## 3) Required Environment Variables / Secrets

- [ ] `KAIXU_APP_TOKENS` (or DB-backed auth stack)
- [ ] Provider credential secret(s) for this brain (example: API key)
- [ ] Core routing/auth variables expected by this worker implementation

## 4) Smoke Validation (Worker-Hosted UI)

- [ ] Open worker URL root `/` or `/smokehouse` (if implemented in this worker)
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
- [ ] Token lifecycle process documented

## 7) Client Acceptance Signoff

- [ ] Deployed worker URL provided
- [ ] Working gate token provided through secure channel
- [ ] Smoke screenshots/logs shared
- [ ] Support owner + escalation contact documented

---

## One-line Handoff Statement

This folder is a standalone deployable brain worker: add credentials, deploy to Cloudflare, and validate via smoke checks.
