# kAIxU Master Upgrade TODO

## Phase 0 — Platform Baseline
- [x] Fix publish-path/link breakages (`/AboutTheFounder.html`, intro route, gateway route variants)
- [x] Harden Netlify redirects (`/about`, `/gateway`, intro canonical routes)
- [x] Run full HTML link scan in `public/`
- [x] Run live crawl against production site

## Phase 1 — Thin App Upgrades (in progress)
- [ ] `public/themeReactorKai.html` → add advanced theme editor, preset management, import/export, optional AI palette generation
- [ ] `public/quickPaletteKai.html` → add full app index launcher + keyboard navigation + recents
- [ ] `public/searchBoosterKai.html` → switch from demo list to full catalog search with launch links and score diagnostics
- [ ] `public/introSkipKai.html` → add intro diagnostics, return-target control, and route quick-jumps
- [ ] `public/offlinePackKai.html` → add custom pack builder, preflight checks, and progress report

## Phase 2 — Ops Tool Hardening
- [ ] `public/watchdogKai.html` add endpoint checks (`/v1/models`, `/v1/generate` preflight)
- [ ] `public/liveModeKai.html` persist env with compatibility checks across pages
- [ ] `public/telemetryLiteKai.html` add validation + replay queue + payload inspector

## Phase 3 — AI App Standardization (all catalog apps)
- [ ] Standardize API base/env selection (`kaixuEnv` + safe fallback)
- [ ] Standardize token handling UX and validation
- [ ] Standardize health indicator behavior
- [ ] Standardize output render safety and copy/export UX
- [ ] Standardize error diagnostics and recovery hints

## Phase 4 — QA + Release
- [ ] Automated route/link audit (internal + JS-driven links)
- [ ] Live site crawl and report export
- [ ] Smoke pass for top 15 revenue-critical apps
- [ ] Final changelog + deployment verification
