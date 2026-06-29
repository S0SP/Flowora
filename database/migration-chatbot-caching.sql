-- Migration: Add Caching Settings and Prompt History Table

ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS cache_resource_name TEXT;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS cache_expires_at TIMESTAMPTZ;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS is_caching_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS chatbot_prompt_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
