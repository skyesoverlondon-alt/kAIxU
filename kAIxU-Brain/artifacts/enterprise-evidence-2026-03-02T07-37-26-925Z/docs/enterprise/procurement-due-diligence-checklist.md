# Procurement Due Diligence Checklist

Use this checklist in enterprise buyer conversations. Each item maps to an existing evidence artifact.

## A) Corporate and Governance

- [ ] Ownership and accountability model documented.
  - Evidence: ops/governance/owner-roster.md
- [ ] Operating cadence and governance board documented.
  - Evidence: docs/enterprise/execution-board.md

## B) Security Program

- [ ] Security control framework and cadence documented.
  - Evidence: ops/compliance/control-matrix.md
- [ ] Security questionnaire baseline prepared.
  - Evidence: ops/compliance/security-questionnaire-kit.md
- [ ] Security architecture summary available.
  - Evidence: docs/enterprise/security-architecture-one-pager.md

## C) Access and Identity

- [ ] Access model and RBAC/SSO direction documented.
  - Evidence: docs/enterprise/02-rbac-sso.md
- [ ] Privileged/admin boundaries identified.
  - Evidence: docs/enterprise/security-architecture-one-pager.md

## D) Reliability and Operations

- [ ] Reliability objectives and error budget policy documented.
  - Evidence: ops/slo/slo-catalog.yaml
- [ ] Weekly operational quality routine documented.
  - Evidence: ops/runbooks/weekly-solo-ops.md
- [ ] Incident response process documented.
  - Evidence: ops/runbooks/incident-response.md

## E) Business Continuity and Resilience

- [ ] DR targets and restoration process documented.
  - Evidence: ops/runbooks/disaster-recovery.md
- [ ] Load and chaos drill program documented.
  - Evidence: ops/runbooks/load-chaos-drill.md

## F) SDLC and Change Management

- [ ] Release controls and checklists documented.
  - Evidence: ops/release/release-checklist.md
- [ ] CI quality gate workflow documented.
  - Evidence: .github/workflows/quality-gates.yml
- [ ] Contract and smoke verification scripts available.
  - Evidence: scripts/contract-test.mjs, scripts/verify-smoke.sh

## G) Data Governance

- [ ] Data lifecycle and retention guidance documented.
  - Evidence: ops/governance/data-lifecycle.md

## H) Auditability and Evidence Packaging

- [ ] Evidence index maps claims to artifacts.
  - Evidence: ops/compliance/evidence-index.md
- [ ] Evidence bundle can be generated on demand.
  - Evidence: scripts/build-evidence-bundle.mjs
  - Command: npm run evidence:bundle

## Final Buyer Packet Contents

- [ ] Enterprise readiness packet
  - docs/enterprise/enterprise-readiness-packet.md
- [ ] Security architecture one-pager
  - docs/enterprise/security-architecture-one-pager.md
- [ ] Trust summary
  - docs/enterprise/trust-summary.md
- [ ] Procurement due diligence checklist
  - docs/enterprise/procurement-due-diligence-checklist.md
