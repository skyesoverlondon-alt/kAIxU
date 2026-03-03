# Security Architecture One-Pager

## System Boundary

kAIxU-Brain is a Cloudflare Worker API surface providing health, model discovery, generation, streaming, embeddings, and admin smoke/audit routes.

Primary boundary components:

- Edge/API runtime: Cloudflare Worker
- Secrets and config: environment bindings/vars
- Smoke and audit persistence: KV namespace
- Upstream AI provider integration: model alias layer in worker

## Trust Zones

1. Public API zone
   - Endpoints: /v1/health, /v1/models, /v1/generate, /v1/stream, /v1/embeddings
2. Privileged admin zone
   - Endpoints: /v1/admin/* and smokehouse control surfaces
3. Control plane zone
   - CI/CD workflow, release checklist, evidence generation

## Security Controls (Current)

- Secret handling via environment-managed configuration (no hard-coded production secrets).
- Documented control matrix and evidence cadence.
- Release quality gates require smoke and contract verification.
- Structured diagnostics and smoke evidence export for incident triage.
- Solo-owner governance with explicit accountability.

## Security Controls (Target/Planned)

- Role-based access policy enforcement on all admin routes.
- OIDC/JWT integration for enterprise identity providers.
- Expanded auth decision telemetry for audit trails.

## Data Protection Posture

- Data lifecycle policy documented for retention and deletion.
- Access governance documented under owner roster policy.
- Operational evidence artifacts retained for audit/readiness.

## Detection and Response

- Incident response runbook with severity model and postmortem requirement.
- Weekly operational routine enforces quality and control checks.
- Planned load/chaos and DR drills validate resilience assumptions.

## Recovery and Continuity

- Disaster recovery runbook defines RTO/RPO and restoration workflow.
- Release process includes rollback checkpoints.

## Assurance Artifacts

- Control matrix: ops/compliance/control-matrix.md
- Evidence index: ops/compliance/evidence-index.md
- Security questionnaire kit: ops/compliance/security-questionnaire-kit.md
- DR runbook: ops/runbooks/disaster-recovery.md
- Incident runbook: ops/runbooks/incident-response.md
- Execution board: docs/enterprise/execution-board.md
