-- Whose Studio connector storage foundation. MIGRATION ONLY: do not execute automatically.
-- All connector tables are private to server-side workers. No anon/authenticated DML grants.
CREATE SCHEMA IF NOT EXISTS whose_connector;
REVOKE ALL ON SCHEMA whose_connector FROM PUBLIC;
CREATE TABLE IF NOT EXISTS whose_connector.sync_cursors (
  retailer text NOT NULL,
  domain text NOT NULL,
  scope_key text NOT NULL DEFAULT 'global',
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  watermark timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (retailer,domain,scope_key),
  CONSTRAINT cursor_retailer_nonempty CHECK (length(trim(retailer)) BETWEEN 1 AND 120),
  CONSTRAINT cursor_domain_nonempty CHECK (length(trim(domain)) BETWEEN 1 AND 80)
);
CREATE TABLE IF NOT EXISTS whose_connector.inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer text NOT NULL,
  event_key text NOT NULL,
  domain text NOT NULL,
  entity_key text NOT NULL,
  payload_digest text NOT NULL,
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','processing','processed','retry','quarantined')),
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error_code text,
  UNIQUE(retailer,event_key),
  CONSTRAINT inbox_digest_format CHECK (payload_digest ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS inbox_due_idx ON whose_connector.inbox(state,received_at)
WHERE state IN ('received','retry');
CREATE TABLE IF NOT EXISTS whose_connector.outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer text NOT NULL,
  domain text NOT NULL,
  operation_id text NOT NULL,
  branch_id bigint,
  intent_digest text NOT NULL,
  state text NOT NULL DEFAULT 'pending_approval' CHECK (state IN
    ('pending_approval','ready','leased','sent','verified','retryable_failure','needs_review','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  attempts int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  last_error_code text,
  UNIQUE(retailer,domain,operation_id),
  CONSTRAINT outbox_digest_format CHECK (intent_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT outbox_approved_state CHECK (
    state='pending_approval' OR state='cancelled' OR
    (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS outbox_due_idx ON whose_connector.outbox(state,created_at)
WHERE state IN ('ready','retryable_failure','needs_review');
CREATE TABLE IF NOT EXISTS whose_connector.attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  outbox_id bigint NOT NULL REFERENCES whose_connector.outbox(id),
  attempted_at timestamptz NOT NULL DEFAULT now(),
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  http_status int CHECK (http_status BETWEEN 100 AND 599),
  outcome text NOT NULL CHECK (outcome IN ('ok','timeout','rejected','unknown')),
  error_code text,
  provider_reference text
);
CREATE INDEX IF NOT EXISTS attempts_outbox_idx ON whose_connector.attempts(outbox_id, attempted_at DESC);
CREATE TABLE IF NOT EXISTS whose_connector.conflicts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer text NOT NULL,
  domain text NOT NULL,
  entity_key text NOT NULL,
  source_digest text NOT NULL CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  target_digest text NOT NULL CHECK (target_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','ignored')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_note text
);
-- Defense in depth. Private schema is NOT part of Supabase public Data API.
ALTER TABLE whose_connector.sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE whose_connector.inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE whose_connector.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE whose_connector.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whose_connector.conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA whose_connector FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA whose_connector FROM PUBLIC,anon,authenticated;
-- No policies, RPC endpoints, cron jobs or dispatchers are installed by this migration.
