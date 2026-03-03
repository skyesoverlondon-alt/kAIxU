# 12. Load and Chaos Drills

## Load Program

- Weekly synthetic load test for `/v1/generate` and `/v1/stream`.
- Track throughput, p95 latency, and error rate.

## Chaos Program

- Inject upstream provider timeout scenario.
- Validate fallback behavior + alerting + incident process.

## Exit Criteria

- SLO remains within budget during drills.
- Incident runbook executed without gaps.

## Asset

- `ops/runbooks/load-chaos-drill.md`
