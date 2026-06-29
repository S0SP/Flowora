-- Migration: Add scheduling columns to campaigns table

-- 1. Add columns if not exist
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS contacts_json JSONB;

-- 2. Update status constraint to include 'scheduled'
-- Drop the check constraint if it exists (usually campaigns_status_check in PG)
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;

-- Add updated check constraint
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check 
  CHECK (status IN ('draft', 'scheduled', 'running', 'completed', 'failed'));
