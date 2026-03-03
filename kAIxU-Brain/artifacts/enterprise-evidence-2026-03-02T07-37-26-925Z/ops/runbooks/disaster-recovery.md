# Disaster Recovery Runbook

## Targets

- RTO: 30 minutes
- RPO: 5 minutes

## Trigger Conditions

- Worker unavailable in primary region.
- KV access failure impacting smoke/audit state.
- Sustained Sev1 or Sev2 with no immediate mitigation.

## Procedure

1. Declare incident and start bridge.
2. Freeze non-essential deployments.
3. Validate latest config in `wrangler.toml` and release metadata.
4. Restore required KV snapshot (smoke/audit metadata).
5. Deploy last known good worker release.
6. Run `npm run smoke:verify`.
7. Validate critical routes: `/v1/health`, `/v1/models`, `/v1/generate`, `/v1/stream`.
8. Announce service restoration and begin heightened monitoring for 60 minutes.

## Exit Criteria

- Smoke verify passes.
- Error rates and latency return within SLO thresholds.
- Incident timeline and evidence captured.
