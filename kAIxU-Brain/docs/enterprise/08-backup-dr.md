# 08. Backup and Disaster Recovery

## Recovery Targets

- **RTO:** 30 minutes for critical API service.
- **RPO:** 5 minutes for smoke and audit metadata.

## Strategy

- Scheduled KV snapshot/export for smoke/audit state.
- Infrastructure config versioned in git.
- Quarterly restore drills in stage.

## Required Runbook

- `ops/runbooks/disaster-recovery.md`
