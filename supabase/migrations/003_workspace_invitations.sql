-- ============================================================
-- FLOWORA — Migration 003: Workspace Invitations
-- Additive: adds invite token system for member onboarding
-- Run in Supabase SQL Editor (service role)
-- ============================================================

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash          TEXT UNIQUE NOT NULL,  -- SHA-256 of the plaintext token; plaintext never stored
  role                TEXT NOT NULL DEFAULT 'agent'
                        CHECK (role IN ('admin','manager','agent','viewer')),
  label               TEXT,                  -- optional human-friendly name ("Sales agent invite")
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at         TIMESTAMPTZ,
  accepted_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitations_workspace ON workspace_invitations(workspace_id)
  WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_token ON workspace_invitations(token_hash);

ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Only workspace admins/owners can see and manage invitations.
-- Anonymous visitors (join page) use the service-role peek endpoint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'workspace_invitations' AND policyname = 'invitations_admin_access'
  ) THEN
    CREATE POLICY "invitations_admin_access" ON workspace_invitations
      FOR ALL USING (
        workspace_id IN (
          SELECT workspace_id FROM workspace_members
          WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;
