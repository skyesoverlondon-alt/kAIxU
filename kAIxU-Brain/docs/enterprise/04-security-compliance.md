# 04. Security and Compliance Controls

## Baseline Framework Mapping

- SOC 2 CC6/CC7/CC8
- ISO 27001 A.8, A.12, A.16
- NIST CSF Identify/Protect/Detect/Respond/Recover

## Required Controls

- Secrets managed by environment bindings only.
- Principle of least privilege for tokens and service accounts.
- CORS allowlist restrictions in production.
- Immutable audit logs retained for minimum 365 days.
- Quarterly access recertification.

## Verification

- `ops/compliance/control-matrix.md`
- CI gate requires smoke + contract checks on every PR.
