# 05. CI/CD Quality Gates

## Gate Sequence

1. Install dependencies.
2. Static quality checks.
3. Smoke verification.
4. API contract tests.
5. Publish release evidence artifact.

## Merge Policy

- PR cannot merge if any gate fails.
- Release deploy blocked unless quality gates pass on default branch.

## Assets

- `.github/workflows/quality-gates.yml`
- `scripts/quality-gates.mjs`
- `scripts/contract-test.mjs`
