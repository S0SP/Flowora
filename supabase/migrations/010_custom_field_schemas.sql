-- Create custom_field_schemas table scoped to workspace_id
CREATE TABLE IF NOT EXISTS custom_field_schemas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  field_name    TEXT NOT NULL,
  field_type    TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'select', 'date', 'boolean')),
  options       TEXT[], -- only used for select type
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, field_name)
);

ALTER TABLE custom_field_schemas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custom_field_schemas' AND policyname = 'custom_fields_workspace_member') THEN
    CREATE POLICY "custom_fields_workspace_member" ON custom_field_schemas
      FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
  END IF;
END $$;
