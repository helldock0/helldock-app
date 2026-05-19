-- ============================================================
-- HELLDOCK · Session 18 · capture_tokens
-- ============================================================
-- Bearer tokens used by the helldock-capture tray agent (separate
-- Electron app) to POST hidden-custom matchIds into /api/captures/ingest.
-- Plaintext token is shown ONCE on creation and never stored — only the
-- sha256 hex hash lives in this table.
-- ============================================================

CREATE TABLE capture_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT UNIQUE NOT NULL,
  label         TEXT NOT NULL,
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id       UUID NOT NULL REFERENCES teams(id)   ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_capture_tokens_team_active
  ON capture_tokens(team_id) WHERE revoked_at IS NULL;

ALTER TABLE capture_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all access for authenticated"
  ON capture_tokens FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
