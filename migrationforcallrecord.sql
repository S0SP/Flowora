-- ============================================================
-- Flowra voice_calls schema migration
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- 1. Add workspace_id to voice_calls so calls are properly
--    scoped to a workspace (not just a user)
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- 2. Add cost_breakdown JSONB column (used by calls page UI)
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb;

-- 3. Backfill workspace_id from workspace_members for existing rows
UPDATE public.voice_calls vc
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = vc.user_id
  AND vc.workspace_id IS NULL;

-- 4. Index for fast Dograh run lookup (livekit_sip_call_id = workflow_run_id)
CREATE INDEX IF NOT EXISTS idx_voice_calls_sip_call_id
  ON public.voice_calls(livekit_sip_call_id)
  WHERE livekit_sip_call_id IS NOT NULL;

-- 5. Index for workspace-scoped call history queries
CREATE INDEX IF NOT EXISTS idx_voice_calls_workspace_created
  ON public.voice_calls(workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

-- Done
SELECT 'Migration complete' AS result;