-- Drop the old constraint
ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS message_templates_status_check;

-- Add the new constraint with uppercase status values (matching Meta API)
ALTER TABLE public.message_templates
  ADD CONSTRAINT message_templates_status_check 
  CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL', 'PENDING_DELETION', 'Draft', 'Pending', 'Approved', 'Rejected', 'Paused', 'Disabled', 'In Appeal', 'Pending Deletion'));

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
