-- ============================================================
-- FLOWORA — Migration 005: Member Presence
-- Additive: per-workspace online/away/offline tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS member_presence (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'online'
                  CHECK (status IN ('online', 'away')),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_presence_workspace ON member_presence(workspace_id);

ALTER TABLE member_presence ENABLE ROW LEVEL SECURITY;

-- Workspace members can read all presence rows for their workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'member_presence' AND policyname = 'presence_workspace_read'
  ) THEN
    CREATE POLICY "presence_workspace_read" ON member_presence
      FOR SELECT USING (
        workspace_id IN (
          SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Users can only upsert their OWN presence row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'member_presence' AND policyname = 'presence_self_write'
  ) THEN
    CREATE POLICY "presence_self_write" ON member_presence
      FOR ALL USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- touch_presence RPC
-- Called by PresenceHeartbeat every ~30s.
-- Uses SECURITY DEFINER so it can bypass RLS and do a single UPSERT
-- in the current user's workspace context.
-- ============================================================
CREATE OR REPLACE FUNCTION touch_presence(p_status TEXT DEFAULT 'online')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_workspace_id UUID;
BEGIN
  -- Resolve workspace from workspace_members (first active membership)
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = v_user_id
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    -- Silently bail if user has no active workspace yet (fresh signup)
    RETURN;
  END IF;

  INSERT INTO member_presence (user_id, workspace_id, status, last_seen_at)
  VALUES (v_user_id, v_workspace_id, p_status, now())
  ON CONFLICT (user_id, workspace_id)
  DO UPDATE SET
    status       = EXCLUDED.status,
    last_seen_at = EXCLUDED.last_seen_at;
END;
$$;

-- Enable realtime on member_presence so usePresence hook gets live updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'member_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE member_presence;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

