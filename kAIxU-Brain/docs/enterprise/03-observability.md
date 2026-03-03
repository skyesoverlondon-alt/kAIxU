# 03. End-to-End Observability

## Telemetry Standards

- Structured JSON logs for all API + admin routes.
- Correlation id (`X-Request-ID`) propagated through responses.
- Metrics dimensions: route, status, model, tenant, environment.

## Mandatory Signals

- **Logs:** request lifecycle + auth decision + smoke outcomes.
- **Metrics:** RPS, error rate, p50/p95 latency, token usage.
- **Traces:** generate and stream spans with upstream provider timing.

## Alert Thresholds

- 5xx > 1% for 5 minutes => Sev2.
- p95 latency breach for 15 minutes => Sev3.
- smoke verify fail 2 consecutive runs => Sev2.

## Assets

- `observability/dashboards/admin-audit-dashboard.json`
