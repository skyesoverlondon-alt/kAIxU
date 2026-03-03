# Branch Protection Policy

This repository should enforce protection on `main` using `.github/policies/branch-protection.main.json` as the source of truth.

## Required Controls

- Pull request required before merge.
- At least 1 approving review.
- Code owner review required.
- Conversation resolution required.
- Required checks: `static-gates`, `live-gates`.
- Force push and deletion disabled.
- Admin enforcement enabled.

## Apply Procedure

Use GitHub settings or API/rulesets to apply these constraints to `main`.

## Verification

- Confirm policy values match this file and JSON policy.
- Confirm required checks are green before merge.
