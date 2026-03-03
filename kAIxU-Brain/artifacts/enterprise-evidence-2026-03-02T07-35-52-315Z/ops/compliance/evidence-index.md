# Evidence Index

This index maps enterprise claims to concrete artifacts for diligence and audit review.

| Domain | Claim | Evidence Artifact |
|---|---|---|
| Reliability | SLOs defined | `ops/slo/slo-catalog.yaml` |
| Reliability | Smoke verification operational | `scripts/verify-smoke.sh`, smoke endpoint outputs |
| Quality | Contract conformance checked | `scripts/contract-test.mjs` |
| Quality | CI/PR gates configured | `.github/workflows/quality-gates.yml` |
| Release | Controlled release process | `ops/release/release-checklist.md` |
| Security | Control requirements documented | `ops/compliance/control-matrix.md` |
| Security | Security questionnaire baseline | `ops/compliance/security-questionnaire-kit.md` |
| Governance | Owner accountability documented | `ops/governance/owner-roster.md` |
| DR | Recovery process documented | `ops/runbooks/disaster-recovery.md` |
| Incident | Incident process documented | `ops/runbooks/incident-response.md` |
| Resilience | Load/chaos routine documented | `ops/runbooks/load-chaos-drill.md` |
| Data Governance | Lifecycle policy documented | `ops/governance/data-lifecycle.md` |
| Observability | Audit dashboard specification | `observability/dashboards/admin-audit-dashboard.json` |
| Executive | Enterprise posture packet | `docs/enterprise/enterprise-readiness-packet.md` |
| External Trust | Customer-facing trust summary | `docs/enterprise/trust-summary.md` |
