-- Migration: Add Lead Capture System

-- 1. Create lead_capture_settings table
CREATE TABLE IF NOT EXISTS lead_capture_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sheet_url TEXT NOT NULL,
  phone_column TEXT NOT NULL DEFAULT 'phone',
  name_column TEXT,
  email_column TEXT,
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'en',
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create lead_capture_leads table (tracks processed leads)
CREATE TABLE IF NOT EXISTS lead_capture_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_capture_settings_id UUID NOT NULL REFERENCES lead_capture_settings(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  row_hash TEXT NOT NULL UNIQUE, -- unique hash of the row values to avoid duplication
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lcl_row_hash ON lead_capture_leads(row_hash);
CREATE INDEX IF NOT EXISTS idx_lcl_status ON lead_capture_leads(status);
