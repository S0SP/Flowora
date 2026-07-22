-- ============================================================
-- Flowra Voice Presets & Dograh Integration Migration
-- Run in Supabase SQL editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- 1. Update `voice_agents` to hold the dograh_workflow_id
ALTER TABLE public.voice_agents
  ADD COLUMN IF NOT EXISTS dograh_workflow_id uuid;

-- 2. Update `lead_capture_settings` to point to a `voice_agent` preset
ALTER TABLE public.lead_capture_settings
  ADD COLUMN IF NOT EXISTS voice_agent_id uuid REFERENCES public.voice_agents(id);

-- Note: We are keeping voice_enabled, voice_agent_type, voice_id, and voice_prompt 
-- temporarily for backwards compatibility until all active lead_capture rows are migrated.

-- ============================================================
-- 3. Include previous migration for call records (if missing)
-- ============================================================
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS cost_breakdown jsonb;

-- Backfill workspace_id from workspace_members for existing rows
UPDATE public.voice_calls vc
SET workspace_id = wm.workspace_id
FROM public.workspace_members wm
WHERE wm.user_id = vc.user_id
  AND vc.workspace_id IS NULL;

-- Index for fast Dograh run lookup (livekit_sip_call_id = workflow_run_id)
CREATE INDEX IF NOT EXISTS idx_voice_calls_sip_call_id
  ON public.voice_calls(livekit_sip_call_id)
  WHERE livekit_sip_call_id IS NOT NULL;

-- Index for workspace-scoped call history queries
CREATE INDEX IF NOT EXISTS idx_voice_calls_workspace_created
  ON public.voice_calls(workspace_id, created_at DESC)
  WHERE workspace_id IS NOT NULL;

SELECT 'Migration complete' AS result;
