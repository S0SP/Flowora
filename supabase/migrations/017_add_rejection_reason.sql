ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS rejection_reason text;

NOTIFY pgrst, 'reload schema';
