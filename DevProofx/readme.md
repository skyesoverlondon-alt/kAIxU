# SOL DevProof Valuator — Fortune 500 App (Netlify)

Upload a repo ZIP → deterministic metrics + AI appraisal → charts + CSV/JSON exports + branded Valuation Certificate PDF.

## Deploy (Netlify Drop)
1. Unzip this folder.
2. Netlify → Add new site → Deploy manually → upload folder.

## Environment Variables (Netlify)
Required:
- KAIXU_GATE_TOKEN
Optional:
- KAIXU_DEFAULT_MODEL (default: kAIxU6.7-pro)
- KAIXU_GATE_URL (default: https://kaixu67.skyesoverlondon.workers.dev)
- ORIGIN_ALLOWLIST (comma-separated; supports wildcards like https://*.netlify.app)

## Notes
Backend routes all AI calls through the kAIxU gate. Certificate fields come back as strict JSON. (See /netlify/functions/valuate.mjs)
