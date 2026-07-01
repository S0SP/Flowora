-- Migration: add cost_breakdown JSONB column to voice_calls
-- Run this in Supabase SQL Editor → New Query

alter table public.voice_calls
  add column if not exists cost_breakdown jsonb default null;

-- Index for querying cost data
create index if not exists voice_calls_cost_idx on public.voice_calls ((cost_breakdown->>'total_inr'));

-- Example of what cost_breakdown looks like:
-- {
--   "total_inr": 1.2340,
--   "breakdown": {
--     "call_pulse":   { "pulses": 2, "rate_per_pulse_inr": 0.5, "cost_inr": 1.0 },
--     "stt_deepgram": { "duration_seconds": 95, "duration_mins": 1.58, "cost_inr": 0.057 },
--     "tts_sarvam":   { "characters": 220, "cost_inr": 0.176 },
--     "llm":          { "provider": "Groq llama-3.1-8b", "estimated_input_tokens": 480, "cost_inr": 0.001 }
--   }
-- }
