-- App Settings (BYOK) Table
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_access_token TEXT,
  meta_phone_number_id TEXT,
  meta_waba_id TEXT,
  livekit_url TEXT,
  livekit_api_key TEXT,
  livekit_api_secret TEXT,
  livekit_sip_trunk_id TEXT,
  sarvam_api_key TEXT,
  gemini_api_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one row exists (Singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_singleton_idx ON app_settings ((1));

-- Insert a default row if none exists
INSERT INTO app_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM app_settings);
