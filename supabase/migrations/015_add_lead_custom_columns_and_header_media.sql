ALTER TABLE public.lead_capture_settings ADD COLUMN IF NOT EXISTS custom_columns jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS header_media_url text;

-- Notify PostgREST to reload the schema cache so the API immediately sees the new columns
NOTIFY pgrst, 'reload schema';
