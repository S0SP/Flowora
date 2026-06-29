-- Migration: Add Groq API Key configuration column to Chatbot Settings

ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS groq_api_key TEXT;
