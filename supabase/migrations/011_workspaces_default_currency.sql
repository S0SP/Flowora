-- Add default_currency column to workspaces table
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'USD';
