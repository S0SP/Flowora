-- Migration: Add AI Chatbot and Voice Agent Settings Tables

-- 1. Chatbot settings table
CREATE TABLE IF NOT EXISTS chatbot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  system_prompt TEXT NOT NULL DEFAULT 'You are a helpful customer service AI assistant for our agency. Answer questions clearly and politely. Keep responses concise (under 3 sentences) and encourage booking a consultation call.',
  gemini_api_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed single default chatbot settings row
INSERT INTO chatbot_settings (id, is_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', FALSE)
ON CONFLICT DO NOTHING;

-- 2. Voice Agent settings table (Vapi / Retell Integration)
CREATE TABLE IF NOT EXISTS voice_agent_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vapi_api_key TEXT,
  vapi_assistant_id TEXT,
  trigger_on_lead BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed single default voice agent settings row
INSERT INTO voice_agent_settings (id, is_enabled)
VALUES ('00000000-0000-0000-0000-000000000002', FALSE)
ON CONFLICT DO NOTHING;
