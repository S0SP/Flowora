-- Run this in Supabase SQL Editor → New Query
-- Creates the voice_calls table with RLS

create table if not exists public.voice_calls (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  phone_number    text not null,
  agent_type      text not null default 'livekit',  -- 'livekit' | 'gemini'
  voice_id        text default 'anushka',
  status          text not null default 'initiated', -- initiated|ringing|active|completed|failed
  livekit_room_name    text,
  livekit_sip_call_id  text,
  recording_url   text,
  transcript      text,
  duration_seconds integer,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Enable Row-Level Security
alter table public.voice_calls enable row level security;

-- Users can only see/insert/update their own calls
create policy "users_select_own_calls" on public.voice_calls
  for select using (auth.uid() = user_id);

create policy "users_insert_own_calls" on public.voice_calls
  for insert with check (auth.uid() = user_id);

create policy "users_update_own_calls" on public.voice_calls
  for update using (auth.uid() = user_id);

-- Service role can update any call (for webhooks)
create policy "service_role_all" on public.voice_calls
  for all using (auth.role() = 'service_role');

-- Index for fast lookups
create index if not exists voice_calls_user_id_idx on public.voice_calls (user_id, created_at desc);
create index if not exists voice_calls_phone_idx on public.voice_calls (phone_number);
create index if not exists voice_calls_room_idx on public.voice_calls (livekit_room_name);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger voice_calls_updated_at
  before update on public.voice_calls
  for each row execute procedure public.handle_updated_at();
