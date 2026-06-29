-- Migration: Add Tool Calling Configuration Columns to Chatbot Settings

ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS is_lead_tool_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS is_store_tool_enabled BOOLEAN NOT NULL DEFAULT FALSE;
