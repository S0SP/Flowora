-- Migration: Multi-workflow support for Lead Capture
-- Adds a name column and removes the single-row assumption.

ALTER TABLE lead_capture_settings
  ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Untitled Workflow';

-- Add an index for fast ordering in the workflow list
CREATE INDEX IF NOT EXISTS idx_lcs_active ON lead_capture_settings(is_active);
