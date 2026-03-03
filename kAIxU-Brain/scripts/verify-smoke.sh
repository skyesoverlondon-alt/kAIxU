#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${KAIXU_SMOKE_BASE:-http://127.0.0.1:8701}}"
TOKEN="${KAIXU_SMOKE_TOKEN:-}"

AUTH_ARGS=()
if [[ -n "$TOKEN" ]]; then
  AUTH_ARGS=(-H "Authorization: Bearer $TOKEN")
fi

echo "[verify-smoke] base=$BASE_URL"

AUDIT_JSON="$(curl -fsS "${AUTH_ARGS[@]}" "$BASE_URL/v1/admin/smoke/audit")"
node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("audit not ok");
if (payload.smokeHouse !== "online") throw new Error("smokeHouse is not online");
if (!Array.isArray(payload.checks) || payload.checks.length < 4) throw new Error("audit checks incomplete");
console.log("[verify-smoke] audit ok");
' "$AUDIT_JSON"

RUN_JSON="$(curl -fsS -X POST "${AUTH_ARGS[@]}" "$BASE_URL/v1/admin/smoke/run")"
RUN_ID="$(node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.ok) throw new Error("run not ok");
if (!payload.run) throw new Error("run payload missing");
if (payload.run.engine !== "runtime-smoke-v2") throw new Error("unexpected smoke engine");
if (typeof payload.run.totalChecks !== "number" || payload.run.totalChecks < 7) throw new Error("totalChecks too low");
if (payload.run.failedChecks !== 0) throw new Error("smoke has failures");
if (!Array.isArray(payload.run.failingChecks)) throw new Error("failingChecks missing");
console.log(payload.run.id);
' "$RUN_JSON")"
echo "[verify-smoke] run ok id=$RUN_ID"

LOG_JSON="$(curl -fsS "${AUTH_ARGS[@]}" "$BASE_URL/v1/admin/smoke/log")"
node -e '
const payload = JSON.parse(process.argv[1]);
const runId = process.argv[2];
if (!payload.ok) throw new Error("log not ok");
if (!payload.log || !payload.log.latestRun) throw new Error("latestRun missing");
if (payload.log.latestRun.id !== runId) throw new Error("latestRun does not match run id");
if (!Array.isArray(payload.log.latestRun.checks) || payload.log.latestRun.checks.length < 7) throw new Error("latestRun checks incomplete");
console.log("[verify-smoke] log ok");
' "$LOG_JSON" "$RUN_ID"

SMOKEHOUSE_HTML="$(curl -fsS -X POST "$BASE_URL/smokehouse" -d "action=run")"
if [[ "$SMOKEHOUSE_HTML" != *"Action: run"* ]]; then
  echo "[verify-smoke] smokehouse action output missing" >&2
  exit 1
fi
echo "[verify-smoke] smokehouse post ok"

echo "[verify-smoke] PASS"
