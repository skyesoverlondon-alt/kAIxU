# 01. Reliability SLOs

## Service Level Objectives

- **Availability SLO:** 99.95% monthly for `/v1/health`, `/v1/models`, `/v1/generate`, `/v1/stream`.
- **Latency SLO:** p95 < 1200ms for `/v1/generate`, p95 < 300ms for `/v1/health`.
- **Correctness SLO:** smoke verify pass rate >= 99% of runs.

## Error Budget Policy

- Monthly budget for 99.95% availability: **21m 54s**.
- Burn alerts:
  - Fast burn: >10% budget in 1 hour.
  - Slow burn: >25% budget in 24 hours.

## Alerting Actions

- Fast burn => page on-call immediately.
- Slow burn => create incident ticket and mitigation within same shift.

## Evidence

- `ops/slo/slo-catalog.yaml`
- `observability/dashboards/admin-audit-dashboard.json`
- `npm run smoke:verify`
