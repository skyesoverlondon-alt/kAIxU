# Weekly Solo Ops (15-Minute Routine)

Use this once per week to keep reliability, compliance, and release readiness tight.

## 0) Start (2 min)

- Confirm no active Sev1/Sev2 incidents.
- Confirm current environment target (`KAIXU_BASE_URL`) is correct.

## 1) Health + Quality (5 min)

Run:

- `npm run quality:gates`

Expected:

- smoke verify: pass
- contract test: pass
- quality gates: pass

If fail:

- stop feature work
- capture diagnostics from smoke UI
- open remediation task before continuing

## 2) Release Readiness (3 min)

Review:

- `ops/release/release-checklist.md`
- latest smoke evidence export from standalone UI
- `observability/dashboards/admin-audit-dashboard.json` panels status

## 3) Compliance Hygiene (3 min)

Review and update:

- `ops/compliance/control-matrix.md`
- `ops/governance/owner-roster.md`

Record any drift in a weekly note (issues, risks, or controls not met).

## 4) Resilience Follow-up (2 min)

- Confirm next load/chaos drill date from `ops/runbooks/load-chaos-drill.md`.
- Confirm DR test cadence from `ops/runbooks/disaster-recovery.md`.

## Weekly Exit Criteria

- All quality gates pass.
- No untracked control drift.
- Next resilience test date is scheduled.
- Release checklist is current.
