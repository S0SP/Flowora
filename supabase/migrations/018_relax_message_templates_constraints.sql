ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_category_check,
  DROP CONSTRAINT IF EXISTS message_templates_header_type_check,
  DROP CONSTRAINT IF EXISTS message_templates_quality_score_check,
  DROP CONSTRAINT IF EXISTS message_templates_status_check;

NOTIFY pgrst, 'reload schema';
