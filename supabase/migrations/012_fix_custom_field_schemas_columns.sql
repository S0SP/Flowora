-- ============================================================
-- FLOWORA — Migration 012: Fix custom_field_schemas columns
-- Rename name→field_name, type→field_type (match frontend code)
-- Add missing created_by column
-- Also fix tags table: add created_by column
-- ============================================================

-- Rename columns on custom_field_schemas to match frontend
DO $$
BEGIN
  -- Rename 'name' to 'field_name' if it exists as 'name'
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_field_schemas' AND column_name = 'name'
  ) THEN
    ALTER TABLE custom_field_schemas RENAME COLUMN name TO field_name;
  END IF;

  -- Rename 'type' to 'field_type' if it exists as 'type'
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_field_schemas' AND column_name = 'type'
  ) THEN
    ALTER TABLE custom_field_schemas RENAME COLUMN type TO field_type;
  END IF;

  -- Add created_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_field_schemas' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE custom_field_schemas
      ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  -- Drop old unique constraint on (workspace_id, name) if it exists
  -- and recreate with new column name
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'custom_field_schemas'
    AND constraint_type = 'UNIQUE'
    AND constraint_name LIKE '%name%'
  ) THEN
    ALTER TABLE custom_field_schemas
      DROP CONSTRAINT IF EXISTS custom_field_schemas_workspace_id_name_key;
  END IF;
END $$;

-- Ensure the unique constraint uses field_name
ALTER TABLE custom_field_schemas
  DROP CONSTRAINT IF EXISTS custom_field_schemas_workspace_id_field_name_key;

ALTER TABLE custom_field_schemas
  ADD CONSTRAINT custom_field_schemas_workspace_id_field_name_key
  UNIQUE (workspace_id, field_name);

-- Add created_by to tags if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tags' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE tags
      ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
