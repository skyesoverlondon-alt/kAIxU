# Load + Chaos Drill Runbook

## Load Drill

- Frequency: weekly (stage), monthly (prod read-only where possible)
- Targets: `/v1/generate`, `/v1/stream`
- Success criteria:
  - Error rate < 1%
  - p95 latency within SLO threshold
  - No sustained smoke regression

## Chaos Drill Scenarios

1. Upstream provider timeout burst.
2. Invalid credential rotation event.
3. Partial admin route degradation.

## Procedure

1. Announce drill window.
2. Execute synthetic load and selected chaos scenario.
3. Observe alerts, dashboards, and runbooks.
4. Record MTTD/MTTR and gaps.
5. File remediation tasks within 24 hours.
