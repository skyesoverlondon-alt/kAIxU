-- kAIxU Admin Platform — Neon Postgres Schema
-- Run this once against your Neon database to initialize all tables.
-- Neon console: neon.tech → Your Project → SQL Editor → paste & run

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tokens ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT NOT NULL,               -- "Gray iPhone", "App: kAIxUchat"
  token_hash      TEXT NOT NULL UNIQUE,        -- SHA-256 of the actual token (never stored in plaintext)
  token_prefix    TEXT NOT NULL,               -- first 12 chars for display "kxu_abc12345..."
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,                 -- NULL = never expires
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      TEXT,                        -- admin email
  allowed_models  TEXT[],                      -- NULL = all allowed models
  monthly_limit   INTEGER,                     -- NULL = unlimited requests/month
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_tokens_hash     ON tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_active   ON tokens (is_active);
CREATE INDEX IF NOT EXISTS idx_tokens_expires  ON tokens (expires_at) WHERE expires_at IS NOT NULL;

-- ── Request Logs ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS request_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          TEXT NOT NULL,               -- X-Request-ID from worker
  token_id            UUID REFERENCES tokens(id),
  token_prefix        TEXT,
  model               TEXT,
  endpoint            TEXT,                        -- /v1/generate | /v1/stream
  prompt_tokens       INTEGER DEFAULT 0,
  candidates_tokens   INTEGER DEFAULT 0,
  thoughts_tokens     INTEGER DEFAULT 0,
  total_tokens        INTEGER DEFAULT 0,
  finish_reason       TEXT,
  status_code         INTEGER,
  duration_ms         INTEGER,
  error               TEXT,
  ts                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_token_id  ON request_logs (token_id);
CREATE INDEX IF NOT EXISTS idx_logs_ts        ON request_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_req_id    ON request_logs (request_id);

-- ── Daily Usage Rollup ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_usage (
  date        DATE NOT NULL,
  token_id    UUID NOT NULL REFERENCES tokens(id),
  requests    INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, token_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_usage (date DESC);

-- ── API Key Vault ──────────────────────────────────────────────────────────────
-- Tracks METADATA about provider keys only. Actual keys never enter this DB.
-- Real keys live in Cloudflare Secrets only.
CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,               -- "gemini", "openai", "anthropic"
  label           TEXT,
  key_prefix      TEXT,                        -- first 8 chars of real key for identification
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_rotated_at TIMESTAMPTZ,
  rotation_due_at TIMESTAMPTZ,                 -- set to added_at + 90 days
  notes           TEXT
);

-- ── System Events / Audit Log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL,          -- token_created, token_revoked, key_rotated, login, etc.
  actor       TEXT,                   -- admin email
  target      TEXT,                   -- token label, key label, etc.
  details     JSONB,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON system_events (ts DESC);

-- ── Daily Rollup Trigger ───────────────────────────────────────────────────────
-- Upserts daily_usage whenever a log row is inserted.
CREATE OR REPLACE FUNCTION upsert_daily_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.token_id IS NOT NULL THEN
    INSERT INTO daily_usage (date, token_id, requests, total_tokens, errors)
    VALUES (
      DATE(NEW.ts),
      NEW.token_id,
      1,
      COALESCE(NEW.total_tokens, 0),
      CASE WHEN NEW.status_code >= 400 THEN 1 ELSE 0 END
    )
    ON CONFLICT (date, token_id) DO UPDATE SET
      requests     = daily_usage.requests + 1,
      total_tokens = daily_usage.total_tokens + COALESCE(NEW.total_tokens, 0),
      errors       = daily_usage.errors + CASE WHEN NEW.status_code >= 400 THEN 1 ELSE 0 END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_usage ON request_logs;
CREATE TRIGGER trg_daily_usage
  AFTER INSERT ON request_logs
  FOR EACH ROW EXECUTE FUNCTION upsert_daily_usage();
