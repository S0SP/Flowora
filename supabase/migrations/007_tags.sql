-- ============================================================
-- FLOWORA — Migration 007: Workspace Tags
-- Additive: named + coloured tags for contacts & conversations
-- (Flowra's contacts.tags is TEXT[], this adds a structured tags
--  table that WaCRM's tag-manager and inbox tag-filter use.)
-- ============================================================

CREATE TABLE IF NOT EXISTS tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#6366f1',  -- hex colour
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_workspace ON tags(workspace_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tags' AND policyname = 'tags_workspace_member'
  ) THEN
    CREATE POLICY "tags_workspace_member" ON tags
      FOR ALL USING (
        workspace_id IN (
          SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
