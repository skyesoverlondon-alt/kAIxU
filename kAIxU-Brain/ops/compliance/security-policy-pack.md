# Security Policy Pack

This pack consolidates security governance artifacts for enterprise diligence.

## Policy Components

- Vulnerability disclosure and response SLA: `.github/SECURITY.md`
- Branch protection source of truth: `.github/policies/branch-protection.main.json`
- Branch protection narrative: `.github/policies/branch-protection.md`
- Repository ownership enforcement: `.github/CODEOWNERS`
- Dependency update automation: `.github/dependabot.yml`
- Control mapping and cadence: `ops/compliance/control-matrix.md`
- Security architecture summary: `docs/enterprise/security-architecture-one-pager.md`

## Minimum Enforcement Baseline

- Protected `main` branch with required status checks.
- CODEOWNERS required review for governed directories.
- Dependabot weekly update cadence.
- Security report intake and response targets.
- Release blocked by failed smoke/contract quality gates.

## Evidence Collection

Use `npm run evidence:bundle` to package policy artifacts for diligence.
