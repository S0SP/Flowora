-- ============================================================
-- FLOWORA — Primary Database Schema
-- Migration: 001_tenancy_foundation.sql
-- Run this in the Supabase SQL Editor (service role)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for fuzzy search

-- ============================================================
-- WORKSPACES
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  industry      TEXT,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  logo_url      TEXT,
  plan          TEXT NOT NULL DEFAULT 'trial', -- trial | pro | business | enterprise
  plan_expires_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_id);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_owner_all" ON workspaces
  FOR ALL USING (owner_id = auth.uid());

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  full_name       TEXT,
  avatar_url      TEXT,
  phone           TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_self" ON profiles
  FOR ALL USING (id = auth.uid());

-- auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles(id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE PROCEDURE handle_new_user();

-- ============================================================
-- WORKSPACE MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'agent', -- owner|admin|manager|agent|viewer
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|active|suspended
  permissions   JSONB NOT NULL DEFAULT '{}',
  credit_limit  INTEGER, -- NULL = unlimited
  invited_by    UUID REFERENCES auth.users(id),
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_members_workspace ON workspace_members(workspace_id);
CREATE INDEX idx_members_user ON workspace_members(user_id);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_workspace_access" ON workspace_members
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members m2 WHERE m2.user_id = auth.uid()
    )
  );

-- ============================================================
-- WORKSPACE SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id    UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  default_language TEXT NOT NULL DEFAULT 'en',
  ai_model        TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
  auto_assign     BOOLEAN NOT NULL DEFAULT TRUE,
  business_hours  JSONB NOT NULL DEFAULT '{"enabled":false,"tz":"Asia/Kolkata"}',
  chat_widget     JSONB NOT NULL DEFAULT '{}',
  voice_config    JSONB NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_workspace_member" ON workspace_settings
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- CHANNEL CONNECTIONS (WhatsApp, Email, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          TEXT NOT NULL, -- whatsapp|email|sms|livekit|voice|instagram
  label         TEXT NOT NULL DEFAULT '',
  config        JSONB NOT NULL DEFAULT '{}',  -- public config (phone_number_id, waba_id, smtp host, etc.)
  secrets       JSONB NOT NULL DEFAULT '{}',  -- AES-256-GCM encrypted secrets
  status        TEXT NOT NULL DEFAULT 'active', -- active|inactive|error
  last_error    TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, type)
);

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "channels_workspace_member" ON channel_connections
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  company         TEXT,
  job_title       TEXT,
  avatar_url      TEXT,
  channel         TEXT DEFAULT 'whatsapp',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  lead_score      INTEGER NOT NULL DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  engagement      INTEGER NOT NULL DEFAULT 0 CHECK (engagement >= 0 AND engagement <= 100),
  intent          INTEGER NOT NULL DEFAULT 0 CHECK (intent >= 0 AND intent <= 100),
  profile_fit     INTEGER NOT NULL DEFAULT 0 CHECK (profile_fit >= 0 AND profile_fit <= 100),
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  opt_out         BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id),
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(workspace_id, phone);
CREATE INDEX idx_contacts_email ON contacts(workspace_id, email);
CREATE INDEX idx_contacts_search ON contacts USING gin(to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email,'') || ' ' || coalesce(company,'')));

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_workspace_member" ON contacts
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- THREADS (Conversations)
-- ============================================================
CREATE TABLE IF NOT EXISTS threads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL DEFAULT 'whatsapp',
  status              TEXT NOT NULL DEFAULT 'open', -- open|closed|snoozed|bot
  assigned_to         UUID REFERENCES auth.users(id),
  ai_active           BOOLEAN NOT NULL DEFAULT TRUE,
  unread_count        INTEGER NOT NULL DEFAULT 0,
  channel_connection_id UUID REFERENCES channel_connections(id),
  last_message_at     TIMESTAMPTZ,
  snoozed_until       TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_by          UUID REFERENCES auth.users(id),
  meta                JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_threads_workspace ON threads(workspace_id);
CREATE INDEX idx_threads_contact ON threads(contact_id);
CREATE INDEX idx_threads_status ON threads(workspace_id, status);
CREATE INDEX idx_threads_assigned ON threads(workspace_id, assigned_to);
CREATE INDEX idx_threads_last_msg ON threads(workspace_id, last_message_at DESC NULLS LAST);

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "threads_workspace_member" ON threads
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- Helper function for incrementing unread count
CREATE OR REPLACE FUNCTION increment_unread(thread_id UUID)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT unread_count INTO current_count FROM threads WHERE id = thread_id;
  RETURN coalesce(current_count, 0) + 1;
END;
$$;

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id       UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  wa_message_id   TEXT,   -- WhatsApp message ID for status tracking
  content         TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'text', -- text|image|audio|video|file|note|template
  sender_type     TEXT NOT NULL DEFAULT 'contact', -- contact|agent|bot|note
  sender_id       UUID,   -- user id for agent/bot, contact id for contact
  status          TEXT NOT NULL DEFAULT 'sent', -- sent|delivered|read|failed
  file_url        TEXT,
  file_name       TEXT,
  file_size       INTEGER,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_workspace_member" ON messages
  FOR ALL USING (
    workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );

-- ============================================================
-- PIPELINES & STAGES (CRM)
-- ============================================================
CREATE TABLE IF NOT EXISTS pipelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pipeline_id   UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT NOT NULL DEFAULT '#E8E8E4',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pipeline_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  pipeline_id   UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id      UUID NOT NULL REFERENCES pipeline_stages(id),
  contact_id    UUID REFERENCES contacts(id),
  title         TEXT NOT NULL,
  value         NUMERIC(12,2),
  currency      TEXT NOT NULL DEFAULT 'INR',
  assigned_to   UUID REFERENCES auth.users(id),
  due_date      DATE,
  labels        TEXT[] NOT NULL DEFAULT '{}',
  meta          JSONB NOT NULL DEFAULT '{}',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipelines_member" ON pipelines FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "stages_member" ON pipeline_stages FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "cards_member" ON pipeline_cards FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- WORKFLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft', -- draft|active|paused|archived
  trigger_type  TEXT NOT NULL DEFAULT 'webhook', -- webhook|google_sheet|cron|manual
  trigger_config JSONB NOT NULL DEFAULT '{}',
  nodes         JSONB NOT NULL DEFAULT '[]',
  edges         JSONB NOT NULL DEFAULT '[]',
  run_count     INTEGER NOT NULL DEFAULT 0,
  last_run_at   TIMESTAMPTZ,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'running', -- running|completed|failed|cancelled
  trigger_data  JSONB NOT NULL DEFAULT '{}',
  result        JSONB,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows_member" ON workflows FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "workflow_runs_member" ON workflow_runs FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp|email|sms|voice
  status          TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|sending|sent|paused|failed
  template_id     TEXT,    -- WhatsApp template name
  template_lang   TEXT NOT NULL DEFAULT 'en',
  subject         TEXT,    -- email subject
  body            TEXT,    -- message body / template
  audience_filter JSONB NOT NULL DEFAULT '{}',
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count      INTEGER NOT NULL DEFAULT 0,
  replied_count   INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  cost_credits    INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_member" ON campaigns FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'document', -- document|faq|url|product
  content       TEXT NOT NULL,
  source_url    TEXT,
  file_url      TEXT,
  file_name     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending|processing|indexed|failed
  chunk_count   INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  doc_id        UUID NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector(768),  -- requires pgvector extension
  token_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "docs_member" ON knowledge_docs FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "chunks_member" ON knowledge_chunks FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- VOICE AGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS voice_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'livekit', -- livekit|sarvam
  system_prompt   TEXT NOT NULL,
  voice_id        TEXT NOT NULL DEFAULT 'en-IN-default',
  language        TEXT NOT NULL DEFAULT 'en-IN',
  max_call_duration INTEGER NOT NULL DEFAULT 300, -- seconds
  status          TEXT NOT NULL DEFAULT 'inactive', -- active|inactive
  config          JSONB NOT NULL DEFAULT '{}',
  call_count      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES voice_agents(id),
  contact_id      UUID REFERENCES contacts(id),
  thread_id       UUID REFERENCES threads(id),
  direction       TEXT NOT NULL DEFAULT 'outbound', -- inbound|outbound
  status          TEXT NOT NULL DEFAULT 'initiated', -- initiated|ringing|active|completed|failed|missed
  livekit_room_id TEXT,
  recording_url   TEXT,
  transcript      TEXT,
  summary         TEXT,
  duration_seconds INTEGER,
  cost_credits    INTEGER NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "voice_agents_member" ON voice_agents FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "voice_calls_member" ON voice_calls FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- CREDITS & BILLING
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_wallets (
  workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  balance       INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved      INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type          TEXT NOT NULL, -- debit|credit|refund|subscription_grant|purchase
  operation     TEXT,          -- whatsapp_message|voice_minute|campaign|ai_token|email
  amount        INTEGER NOT NULL, -- positive=credit, negative=debit
  balance_after INTEGER,
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_workspace ON credit_ledger(workspace_id, created_at DESC);

ALTER TABLE credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_workspace_member" ON credit_wallets FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "ledger_workspace_member" ON credit_ledger FOR ALL USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL, -- new_message|lead_assigned|workflow_completed|credit_low|team_invite
  title         TEXT NOT NULL,
  body          TEXT,
  link          TEXT,
  read          BOOLEAN NOT NULL DEFAULT FALSE,
  meta          JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_self" ON notifications FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id),
  action        TEXT NOT NULL, -- workspace.create|member.invite|channel.connect|campaign.send|etc.
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  meta          JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_workspace ON audit_logs(workspace_id, created_at DESC);

-- Audit log is append-only — no RLS delete, only insert/select
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_workspace_member" ON audit_logs
  FOR SELECT USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "audit_insert" ON audit_logs
  FOR INSERT WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

-- ============================================================
-- REALTIME
-- Enable realtime for live inbox updates
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE threads;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
