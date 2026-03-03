# Enterprise Buyer Q&A Script (10 Questions)

Use this script in technical and procurement calls. Each answer references an evidence artifact.

## 1) How do you ensure release quality?

Answer: Every release path is gated by smoke verification plus API contract tests before promotion.

Evidence:
- scripts/quality-gates.mjs
- scripts/verify-smoke.sh
- scripts/contract-test.mjs
- .github/workflows/quality-gates.yml

## 2) What reliability commitments do you operate against?

Answer: We operate with defined SLO targets and error budget policy for core API routes.

Evidence:
- ops/slo/slo-catalog.yaml
- docs/enterprise/01-reliability-slos.md

## 3) How do you handle incidents?

Answer: We maintain a severity-based incident runbook with response workflow and postmortem requirements.

Evidence:
- ops/runbooks/incident-response.md
- docs/enterprise/09-incident-response.md

## 4) What is your disaster recovery posture?

Answer: RTO/RPO targets and restore workflow are documented and tracked via operational runbooks.

Evidence:
- ops/runbooks/disaster-recovery.md
- docs/enterprise/08-backup-dr.md

## 5) How do you govern security controls?

Answer: We maintain a control matrix mapped to common assurance frameworks with periodic evidence cadence.

Evidence:
- ops/compliance/control-matrix.md
- ops/compliance/security-policy-pack.md

## 6) How is access to privileged functions controlled?

Answer: Privileged boundaries are defined; RBAC/SSO enterprise integration is documented as target posture.

Evidence:
- docs/enterprise/02-rbac-sso.md
- docs/enterprise/security-architecture-one-pager.md

## 7) How do you protect dependency and supply-chain health?

Answer: Dependabot updates, SBOM generation, and security policy workflows are part of the hardening tranche.

Evidence:
- .github/dependabot.yml
- scripts/generate-sbom.mjs
- .github/SECURITY.md

## 8) What governance model do you follow as a solo operator?

Answer: Ownership is explicit and centralized under Skyes Over London with documented operational cadence and accountability.

Evidence:
- ops/governance/owner-roster.md
- docs/enterprise/execution-board.md
- ops/runbooks/weekly-solo-ops.md

## 9) How do you provide audit evidence quickly?

Answer: We maintain an evidence index and can generate a structured evidence bundle on demand.

Evidence:
- ops/compliance/evidence-index.md
- scripts/build-evidence-bundle.mjs

## 10) What should procurement review first?

Answer: Start with readiness packet, trust summary, security architecture one-pager, and due diligence checklist.

Evidence:
- docs/enterprise/enterprise-readiness-packet.md
- docs/enterprise/trust-summary.md
- docs/enterprise/security-architecture-one-pager.md
- docs/enterprise/procurement-due-diligence-checklist.md
