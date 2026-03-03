# Release Checklist

## Pre-Deploy

- [ ] `npm ci`
- [ ] `npm run quality:gates`
- [ ] Confirm owner roster is up to date (`ops/governance/owner-roster.md`)
- [ ] Confirm no critical open incidents
- [ ] Verify rollback target + command

## Deploy

- [ ] Deploy to stage and run smoke verification
- [ ] Canary rollout (5% -> 25% -> 100%)
- [ ] Watch SLO/error dashboard during each step

## Post-Deploy

- [ ] Export smoke verify evidence
- [ ] Confirm admin smoke log reflects current run
- [ ] Publish release summary with evidence links
- [ ] Tag release summary with owner + backup owner from roster
