-- Create message_templates table scoped to workspace_id
CREATE TABLE IF NOT EXISTS message_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Marketing' CHECK (category IN ('Marketing', 'Utility', 'Authentication')),
  language      TEXT DEFAULT 'en_US',
  header_type   TEXT CHECK (header_type IN ('text', 'image', 'video', 'document')),
  header_content TEXT,
  header_handle TEXT,
  body_text     TEXT NOT NULL,
  footer_text   TEXT,
  buttons       JSONB,
  sample_values JSONB,
  status        TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending', 'Approved', 'Rejected', 'Paused', 'Disabled', 'In Appeal', 'Pending Deletion')),
  meta_template_id TEXT,
  quality_score TEXT CHECK (quality_score IN ('GREEN', 'YELLOW', 'RED')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, name, language)
);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'message_templates' AND policyname = 'templates_workspace_member') THEN
    CREATE POLICY "templates_workspace_member" ON message_templates
      FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
  END IF;
END $$;
