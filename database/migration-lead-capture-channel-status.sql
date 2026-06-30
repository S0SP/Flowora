-- Migration: per-channel delivery breakdown for the Lead Capture activity panel.
-- Stores a small JSON object like:
--   {
--     "whatsapp": "sent" | "failed" | "disabled",
--     "whatsapp_error": null | "...",
--     "email":    "sent" | "failed" | "no_email" | "disabled",
--     "email_error": null | "...",
--     "voice":    "sent" | "failed" | "disabled",
--     "voice_error": null | "...",
--     "updated_at": "2026-06-30T22:31:06.000Z"
--   }
ALTER TABLE lead_capture_leads
  ADD COLUMN IF NOT EXISTS channel_status JSONB;
