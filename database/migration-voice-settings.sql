-- Voice Agent Settings per workspace
create table if not exists voice_agent_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid unique not null references workspaces(id) on delete cascade,
  voice_id text not null default 'anushka',
  agent_type text not null default 'livekit' check (agent_type in ('livekit', 'gemini')),
  language_preset text not null default 'hinglish',
  sarvam_language text not null default 'hi-IN',
  deepgram_language text not null default 'hi',
  system_prompt text,
  call_objective text,
  calling_hours_start time default '09:00',
  calling_hours_end time default '19:00',
  max_call_attempts integer default 3,
  retry_interval_minutes integer default 60,
  recording_enabled boolean default true,
  transcription_enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chatbot FAQ entries
create table if not exists chatbot_faqs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  question text not null,
  answer text not null,
  is_active boolean default true,
  match_type text default 'contains' check (match_type in ('exact', 'contains', 'starts_with')),
  priority integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists chatbot_faqs_workspace_idx on chatbot_faqs(workspace_id);

-- Lead capture workflow_id column (for multi-workflow support)
alter table lead_capture_leads add column if not exists workflow_id uuid;
create index if not exists lead_capture_leads_workflow_idx on lead_capture_leads(workflow_id, phone);

-- Add unique constraint for deduplication
create unique index if not exists lead_capture_leads_phone_workflow_unique
  on lead_capture_leads(phone, workflow_id)
  where workflow_id is not null;

-- Contacts: add whatsapp opt-in + stage
alter table contacts add column if not exists whatsapp_opted_in boolean default false;
alter table contacts add column if not exists stage text default 'new_lead';
alter table contacts add column if not exists lead_score integer default 0;
alter table contacts add column if not exists channel text default 'whatsapp';
alter table contacts add column if not exists full_name text;
