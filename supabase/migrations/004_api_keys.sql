-- ============================================================
-- FLOWORA — Migration 004: API Keys
-- Additive: workspace-scoped API keys for external integrations
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT UNIQUE NOT NULL,   -- bcrypt or SHA-256 of the plaintext key
  key_prefix    TEXT NOT NULL,          -- first 8 chars for display, e.g. "flw_abc1"
  scopes        TEXT[] NOT NULL DEFAULT ARRAY['read','write'],
  created_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,           -- NULL = never expires
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at    TIMESTAMPTZ            -- NULL = active
);

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Only admin+ can manage API keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'api_keys_admin_access'
  ) THEN
    CREATE POLICY "api_keys_admin_access" ON api_keys
      FOR ALL USING (
        workspace_id IN (
          SELECT workspace_id FROM workspace_members
          WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;
