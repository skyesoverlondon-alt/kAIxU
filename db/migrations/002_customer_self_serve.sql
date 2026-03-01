-- kAIxU — Customer Self-Serve Migration
-- Run this AFTER schema.sql (the initial schema must already exist).
-- Neon console: neon.tech → Your Project → SQL Editor → paste & run

-- ── Customer accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                     BIGSERIAL PRIMARY KEY,
  email                  TEXT UNIQUE NOT NULL,
  stripe_customer_id     TEXT,                      -- Stripe cus_xxx
  stripe_subscription_id TEXT,                      -- Stripe sub_xxx (active plan only)
  tier                   TEXT NOT NULL DEFAULT 'lite',  -- lite | starter | pro | enterprise
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_email        ON customers (email);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_cust  ON customers (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_sub   ON customers (stripe_subscription_id);

-- ── Magic link tokens (passwordless auth) ────────────────────────────────────
-- Rows older than 24 hours can be safely deleted (cron or manual).
CREATE TABLE IF NOT EXISTS customer_magic_links (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  token      TEXT UNIQUE NOT NULL,    -- 64 hex chars (256-bit random)
  expires_at TIMESTAMPTZ NOT NULL,    -- created_at + 15 minutes
  used_at    TIMESTAMPTZ,             -- NULL = not yet used
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token  ON customer_magic_links (token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email  ON customer_magic_links (email);

-- ── Link API tokens to customer accounts ─────────────────────────────────────
ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tokens_customer_id ON tokens (customer_id)
  WHERE customer_id IS NOT NULL;

-- ── Telemetry events (if not already created) ────────────────────────────────
CREATE TABLE IF NOT EXISTS telemetry_events (
  id          BIGSERIAL PRIMARY KEY,
  event_name  TEXT,
  page        TEXT,
  request_id  TEXT,
  session_id  TEXT,
  duration_ms INTEGER,
  meta        JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
