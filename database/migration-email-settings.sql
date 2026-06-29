-- Migration: Add SMTP and Email Template columns to lead_capture_settings

ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS smtp_host TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS smtp_user TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS smtp_password TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_from_name TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_from TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_subject TEXT;

-- Email Template customizable variables
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_template_id TEXT DEFAULT 'welcome';
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_logo_url TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_brand_name TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_title TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_body TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_button_text TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_button_url TEXT;
ALTER TABLE lead_capture_settings ADD COLUMN IF NOT EXISTS email_footer TEXT;
