# Incident Response Runbook

## Severity

- Sev1: outage or severe customer impact.
- Sev2: critical feature unavailable or repeated smoke failure.
- Sev3: degraded performance with workaround.
- Sev4: minor issue.

## Roles

- Incident Commander
- Operations Lead
- Communications Lead
- Scribe

## Workflow

1. Detect + triage.
2. Declare severity and open incident channel.
3. Assign roles and mitigation owners.
4. Execute mitigation and capture timeline.
5. Confirm service health and customer impact resolved.
6. Publish postmortem with corrective actions.

## Escalation Targets

- Sev1: immediate full focus; pause non-incident deployments.
- Sev2: mitigation initiated within same working session.
- Sev3/Sev4: scheduled remediation with documented owner and due date.

## Communication Templates

- Incident declared: issue summary, impact, start time, current status.
- Mitigation update: action taken, expected verification time.
- Resolution update: resolution time, impact summary, next steps.

## Evidence Requirements

- Timeline with UTC timestamps.
- Root cause and contributing factors.
- Mitigation and verification proof (smoke/contract outputs if applicable).
- Follow-up action list with dates.

## Required Artifacts

- Timeline with UTC timestamps.
- Root cause statement.
- Action items with owner and due date.
