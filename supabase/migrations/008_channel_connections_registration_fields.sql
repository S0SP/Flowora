-- Add registration-related columns to channel_connections table for WhatsApp status tracking
ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscribed_apps_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_registration_error TEXT;

CREATE INDEX IF NOT EXISTS idx_channel_connections_registered_at
  ON channel_connections (registered_at)
  WHERE registered_at IS NULL;
