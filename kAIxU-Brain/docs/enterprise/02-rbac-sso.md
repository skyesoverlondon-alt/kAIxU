# 02. RBAC and SSO

## Target State

- **Identity provider:** Entra ID or Okta via OIDC.
- **Authentication:** JWT bearer at edge.
- **Authorization:** role claims mapped to endpoint policies.

## Roles

- `kaixu.admin`: full admin routes (`/v1/admin/*`).
- `kaixu.operator`: smoke + audit + read-only admin.
- `kaixu.viewer`: health/models/read-only logs.

## Controls

- Deny-by-default policy for admin endpoints.
- Short-lived access tokens (< 60 minutes).
- Session + token revocation support.

## Implementation Backlog

- Add JWKS validation in worker middleware.
- Add role-to-route policy map.
- Emit auth decision logs to audit dashboard.
