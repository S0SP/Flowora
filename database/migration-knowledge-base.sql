-- Knowledge Base Migration
-- Enables pgvector for semantic search + stores knowledge sources and chunks

-- Enable pgvector extension (run once per database)
create extension if not exists vector;

-- Knowledge sources table
create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  type text not null check (type in ('website', 'pdf', 'docx', 'csv', 'xlsx', 'txt', 'google_sheet', 'google_doc', 'notion')),
  source_url text,
  file_path text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  error_message text,
  metadata jsonb default '{}',
  total_chunks integer default 0,
  total_tokens integer default 0,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Knowledge chunks table (with vector embeddings)
create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references knowledge_sources(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  content text not null,
  embedding vector(768),  -- Gemini text-embedding-004 dimension
  chunk_index integer not null default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Create index for vector similarity search
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for fast workspace lookups
create index if not exists knowledge_chunks_workspace_idx on knowledge_chunks(workspace_id);
create index if not exists knowledge_sources_workspace_idx on knowledge_sources(workspace_id);

-- Chatbot settings table (extended)
create table if not exists chatbot_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid unique not null references workspaces(id) on delete cascade,
  bot_name text not null default 'Aria',
  persona text,
  language text default 'auto',
  response_length integer default 65,
  fallback_message text,
  is_active boolean default true,
  gemini_api_key text,
  model text default 'gemini-2.5-flash',
  temperature float default 0.7,
  max_tokens integer default 1024,
  use_knowledge_base boolean default true,
  whatsapp_enabled boolean default true,
  web_widget_enabled boolean default false,
  escalation_enabled boolean default true,
  escalation_trigger text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Workflow runs table (for workflow execution history)
create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  workflow_id uuid not null,
  trigger_type text,
  trigger_data jsonb default '{}',
  status text default 'running' check (status in ('running', 'completed', 'failed', 'paused')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  error_message text,
  steps_completed integer default 0,
  steps_total integer default 0,
  created_at timestamptz default now()
);

-- Workflows table (save workflow configs from builder)
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  description text,
  nodes jsonb default '[]',
  edges jsonb default '[]',
  status text default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  trigger_type text,
  trigger_config jsonb default '{}',
  last_run_at timestamptz,
  total_runs integer default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Campaign schedule table (scheduled sends)
create table if not exists campaign_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid,
  name text not null,
  template_name text not null,
  template_language text default 'en',
  recipients_filter jsonb default '{}',
  recipient_count integer default 0,
  status text default 'scheduled' check (status in ('draft', 'scheduled', 'running', 'completed', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  timezone text default 'UTC',
  is_recurring boolean default false,
  recurrence_rule text,
  sent_count integer default 0,
  delivered_count integer default 0,
  failed_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Inbox threads table (for shared inbox)
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  channel text not null default 'whatsapp',
  channel_connection_id uuid,
  status text default 'open' check (status in ('open', 'closed', 'archived')),
  assigned_to uuid references auth.users(id) on delete set null,
  ai_active boolean default true,
  unread_count integer default 0,
  last_message_at timestamptz default now(),
  last_message_preview text,
  tags text[] default '{}',
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages table
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  thread_id uuid references threads(id) on delete cascade,
  wa_message_id text unique,
  content text,
  type text default 'text' check (type in ('text', 'image', 'file', 'audio', 'video', 'location', 'template', 'sticker', 'reaction')),
  sender_type text check (sender_type in ('contact', 'agent', 'bot', 'system')),
  sender_id uuid,
  status text default 'sent' check (status in ('sending', 'sent', 'delivered', 'read', 'failed')),
  file_url text,
  file_name text,
  file_size integer,
  thumbnail_url text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Channel connections (WhatsApp, Email, etc)
create table if not exists channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null check (type in ('whatsapp', 'email', 'voice')),
  name text not null,
  config jsonb not null default '{}',
  is_active boolean default true,
  verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Team members (extended)
create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'agent' check (role in ('owner', 'admin', 'manager', 'agent')),
  status text default 'active' check (status in ('active', 'inactive', 'invited', 'suspended')),
  avatar_url text,
  monthly_credit_limit integer,
  max_concurrent_chats integer default 20,
  invite_token text,
  invited_by uuid references auth.users(id),
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, user_id),
  unique(workspace_id, email)
);

-- RLS Policies
alter table knowledge_sources enable row level security;
alter table knowledge_chunks enable row level security;
alter table chatbot_settings enable row level security;
alter table workflows enable row level security;
alter table workflow_runs enable row level security;
alter table campaign_schedules enable row level security;
alter table threads enable row level security;
alter table messages enable row level security;
alter table channel_connections enable row level security;

-- Helper function: match knowledge chunks by embedding similarity
create or replace function match_knowledge_chunks(
  query_embedding vector(768),
  workspace_id_param uuid,
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  source_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    kc.id,
    kc.source_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where
    kc.workspace_id = workspace_id_param
    and 1 - (kc.embedding <=> query_embedding) > match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Function to increment unread count
create or replace function increment_unread(thread_id uuid)
returns integer
language plpgsql
as $$
declare
  current_count integer;
begin
  select unread_count into current_count from threads where id = thread_id;
  return coalesce(current_count, 0) + 1;
end;
$$;
