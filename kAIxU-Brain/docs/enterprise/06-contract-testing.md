# 06. Contract Testing

## Contract Coverage

- `GET /v1/health` returns `ok=true`.
- `GET /v1/models` returns `models[]`.
- `POST /v1/generate` returns candidate text shape.
- `POST /v1/stream` emits SSE with `[DONE]` terminator.
- `GET /v1/admin/smoke/log` returns latest run metadata.

## Automation

- Command: `npm run contract:test`
- Gate: required in CI before merge.

## Failure Policy

- Any contract mismatch is release-blocking.
