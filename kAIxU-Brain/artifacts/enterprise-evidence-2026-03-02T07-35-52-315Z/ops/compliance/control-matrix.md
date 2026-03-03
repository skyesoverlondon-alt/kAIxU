# Control Matrix

Owner role mapping is maintained in `ops/governance/owner-roster.md`.

| Control ID | Objective | Owner | Evidence | Cadence |
|---|---|---|---|---|
| SEC-01 | Secrets are never hard-coded | Skyes Over London | `.dev.vars.template`, env bindings | Every release |
| SEC-02 | Admin endpoints require privileged auth | Skyes Over London | RBAC policy docs + route tests | Monthly |
| SEC-03 | Audit trail is immutable and retained | Skyes Over London | KV log snapshots + exports | Weekly |
| SEC-04 | Incident response is operational | Skyes Over London | Incident runbook + postmortems | Quarterly |
| SEC-05 | DR restore tested | Skyes Over London | DR test report | Quarterly |
| SEC-06 | Data lifecycle enforced | Skyes Over London | Retention + deletion report | Monthly |
