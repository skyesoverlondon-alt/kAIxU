# 07. Multi-Environment Release Strategy

## Environments

- **dev:** fast iteration + synthetic tests.
- **stage:** production-like config + replay traffic.
- **prod:** controlled rollout with rollback plan.

## Release Pattern

- Trunk-based development with protected main branch.
- Canary rollout to 5% / 25% / 100% traffic.
- Automated rollback on SLO breach.

## Required Evidence per Release

- CI quality gate results.
- Smoke verify evidence export.
- Contract test output.
- Change summary + rollback command.

## Assets

- `ops/release/release-checklist.md`
