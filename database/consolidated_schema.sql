-- ============================================================================
-- FLOWORA — COMPLETE CONSOLIDATED PRODUCTION DATABASE SCHEMA
-- Reconstructed directly from Supabase Deployed Schema
-- ============================================================================

-- Clean reset: drop public schema and recreate it
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Re-establish default Supabase roles and permissions
GRANT ALL ON SCHEMA public TO postgres, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CUSTOM TYPES (ENUMS)
-- ============================================================================
CREATE TYPE public.member_role AS ENUM ('owner', 'admin', 'manager', 'agent');
CREATE TYPE public.member_status AS ENUM ('active', 'invited', 'suspended');
CREATE TYPE public.channel_type AS ENUM ('whatsapp', 'email', 'voice', 'sms');
CREATE TYPE public.contact_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE public.conversation_state AS ENUM ('open', 'pending', 'resolved', 'closed', 'bot');
CREATE TYPE public.msg_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE public.msg_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');
CREATE TYPE public.msg_sender AS ENUM ('contact', 'agent', 'ai', 'system');
CREATE TYPE public.campaign_status AS ENUM ('draft', 'scheduled', 'running', 'completed', 'failed', 'paused');
CREATE TYPE public.recipient_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed', 'skipped');
CREATE TYPE public.run_status AS ENUM ('running', 'completed', 'failed', 'cancelled', 'waiting');
CREATE TYPE public.voice_agent_type AS ENUM ('livekit', 'gemini', 'vapi');
CREATE TYPE public.call_status AS ENUM ('queued', 'ringing', 'in-progress', 'completed', 'failed', 'no-answer', 'busy');
CREATE TYPE public.clone_status AS ENUM ('processing', 'ready', 'failed');
CREATE TYPE public.lead_run_status AS ENUM ('pending', 'processing', 'sent', 'failed');
CREATE TYPE public.kb_doc_status AS ENUM ('pending', 'processing', 'ready', 'failed');
CREATE TYPE public.sub_status AS ENUM ('trialing', 'active', 'past_due', 'canceled');
CREATE TYPE public.ledger_reason AS ENUM ('grant', 'debit', 'refund', 'topup', 'adjustment');
CREATE TYPE public.workflow_status AS ENUM ('draft', 'active', 'paused', 'archived');

-- ============================================================================
-- TABLES
-- ============================================================================
CREATE TABLE public.workspaces (
  id                        UUID DEFAULT gen_random_uuid(),
  name                      TEXT,
  slug                      TEXT,
  logo_url                  TEXT,
  industry                  TEXT,
  timezone                  TEXT DEFAULT Asia/Kolkata,
  owner_id                  UUID,
  onboarding_completed      BOOLEAN DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_workspaces PRIMARY KEY (id)
);

CREATE TABLE public.integrations (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  provider                  TEXT,
  status                    TEXT DEFAULT connected,
  account_label             TEXT,
  scopes                    TEXT[],
  secrets_enc               TEXT,
  config                    JSONB,
  created_by                UUID,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_integrations PRIMARY KEY (id)
);

CREATE TABLE public.contacts (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  phone                     TEXT,
  name                      TEXT,
  email                     TEXT,
  company                   TEXT,
  avatar_url                TEXT,
  status                    contact_status DEFAULT active,
  owner_id                  UUID,
  lead_score                INTEGER DEFAULT 0,
  tags                      TEXT[],
  custom_fields             JSONB,
  source                    TEXT,
  message_count             INTEGER DEFAULT 0,
  last_message_at           TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  whatsapp_opted_in         BOOLEAN DEFAULT false,
  stage                     TEXT DEFAULT new_lead,
  channel                   TEXT DEFAULT whatsapp,
  full_name                 TEXT,
  CONSTRAINT pk_contacts PRIMARY KEY (id)
);

CREATE TABLE public.workspace_members (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  user_id                   UUID,
  role                      member_role DEFAULT agent,
  status                    member_status DEFAULT active,
  permissions               JSONB,
  credit_limit              INTEGER,
  credits_used              INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  email                     TEXT,
  full_name                 TEXT,
  monthly_credit_limit      INTEGER,
  max_concurrent_chats      INTEGER DEFAULT 20,
  invite_token              TEXT,
  invited_by                UUID,
  last_seen_at              TIMESTAMPTZ,
  avatar_url                TEXT,
  CONSTRAINT pk_workspace_members PRIMARY KEY (id)
);

CREATE TABLE public.voice_calls (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  voice_agent_id            UUID,
  contact_id                UUID,
  user_id                   UUID,
  to_number                 TEXT,
  from_number               TEXT,
  direction                 msg_direction DEFAULT outbound,
  agent_type                voice_agent_type,
  voice_id                  TEXT,
  status                    call_status DEFAULT queued,
  duration_secs             INTEGER DEFAULT 0,
  recording_url             TEXT,
  livekit_room_name         TEXT,
  livekit_sip_call_id       TEXT,
  credits_used              INTEGER DEFAULT 0,
  outcome                   TEXT,
  error_message             TEXT,
  started_at                TIMESTAMPTZ,
  ended_at                  TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_voice_calls PRIMARY KEY (id)
);

CREATE TABLE public.subscriptions (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  plan_id                   TEXT,
  status                    sub_status DEFAULT trialing,
  stripe_customer_id        TEXT,
  stripe_subscription_id    TEXT,
  current_period_end        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_subscriptions PRIMARY KEY (id)
);

CREATE TABLE public.workflow_templates (
  id                        UUID DEFAULT gen_random_uuid(),
  name                      TEXT,
  description               TEXT,
  category                  TEXT,
  graph                     JSONB,
  is_public                 BOOLEAN DEFAULT true,
  CONSTRAINT pk_workflow_templates PRIMARY KEY (id)
);

CREATE TABLE public.pipeline_stages (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  pipeline_id               UUID,
  name                      TEXT,
  color                     TEXT DEFAULT #C4B1F9,
  position                  INTEGER DEFAULT 0,
  CONSTRAINT pk_pipeline_stages PRIMARY KEY (id)
);

CREATE TABLE public.knowledge_documents (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  knowledge_base_id         UUID,
  title                     TEXT,
  source_type               TEXT,
  source_url                TEXT,
  storage_path              TEXT,
  status                    kb_doc_status DEFAULT pending,
  error_message             TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_knowledge_documents PRIMARY KEY (id)
);

CREATE TABLE public.cloned_voices (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  status                    clone_status DEFAULT processing,
  provider                  TEXT DEFAULT sarvam,
  provider_voice_id         TEXT,
  sample_url                TEXT,
  preview_url               TEXT,
  created_by                UUID,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_cloned_voices PRIMARY KEY (id)
);

CREATE TABLE public.leads (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  contact_id                UUID,
  pipeline_id               UUID,
  stage_id                  UUID,
  owner_id                  UUID,
  value                     NUMERIC DEFAULT 0,
  position                  INTEGER DEFAULT 0,
  status                    TEXT DEFAULT open,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_leads PRIMARY KEY (id)
);

CREATE TABLE public.channel_connections (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  type                      channel_type,
  label                     TEXT,
  is_active                 BOOLEAN DEFAULT true,
  config                    JSONB,
  secrets_enc               TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_channel_connections PRIMARY KEY (id)
);

CREATE TABLE public.threads (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  contact_id                UUID,
  channel                   TEXT DEFAULT whatsapp,
  channel_connection_id     UUID,
  status                    TEXT DEFAULT open,
  assigned_to               UUID,
  ai_active                 BOOLEAN DEFAULT true,
  unread_count              INTEGER DEFAULT 0,
  last_message_at           TIMESTAMPTZ DEFAULT now(),
  last_message_preview      TEXT,
  tags                      TEXT[],
  priority                  TEXT DEFAULT normal,
  metadata                  JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_threads PRIMARY KEY (id)
);

CREATE TABLE public.ticket_events (
  id                        UUID DEFAULT extensions.uuid_generate_v4(),
  ticket_id                 UUID,
  workspace_id              UUID,
  actor_id                  UUID,
  event_type                TEXT,
  from_value                TEXT,
  to_value                  TEXT,
  note                      TEXT,
  metadata                  JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_ticket_events PRIMARY KEY (id)
);

CREATE TABLE public.canned_replies (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  shortcut                  TEXT,
  title                     TEXT,
  body                      TEXT,
  created_by                UUID,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_canned_replies PRIMARY KEY (id)
);

CREATE TABLE public.audit_log (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  actor_id                  UUID,
  action                    TEXT,
  target_type               TEXT,
  target_id                 UUID,
  metadata                  JSONB,
  ip                        TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_audit_log PRIMARY KEY (id)
);

CREATE TABLE public.knowledge_chunks (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  knowledge_base_id         UUID,
  document_id               UUID,
  content                   TEXT,
  embedding                 vector(768),
  token_count               INTEGER,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_knowledge_chunks PRIMARY KEY (id)
);

CREATE TABLE public.profiles (
  id                        UUID,
  email                     TEXT,
  full_name                 TEXT,
  avatar_url                TEXT,
  phone                     TEXT,
  timezone                  TEXT DEFAULT Asia/Kolkata,
  locale                    TEXT DEFAULT en,
  onboarding_completed      BOOLEAN DEFAULT false,
  last_seen_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_profiles PRIMARY KEY (id)
);

CREATE TABLE public.pipelines (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  is_default                BOOLEAN DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_pipelines PRIMARY KEY (id)
);

CREATE TABLE public.tickets (
  id                        UUID DEFAULT extensions.uuid_generate_v4(),
  ref                       INTEGER,
  workspace_id              UUID,
  thread_id                 UUID,
  contact_id                UUID,
  subject                   TEXT,
  description               TEXT,
  status                    TEXT DEFAULT open,
  severity                  TEXT DEFAULT medium,
  flags                     TEXT[],
  source                    TEXT DEFAULT ai_escalation,
  escalation_reason         TEXT,
  assigned_to               UUID,
  created_by                UUID,
  resolved_by               UUID,
  anchor_message_id         UUID,
  resolved_at               TIMESTAMPTZ,
  closed_at                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_tickets PRIMARY KEY (id)
);

CREATE TABLE public.lead_capture_leads (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  lead_capture_settings_id  UUID,
  phone                     TEXT,
  name                      TEXT,
  email                     TEXT,
  row_hash                  TEXT,
  status                    lead_run_status DEFAULT pending,
  channel_status            JSONB,
  scheduled_for             TIMESTAMPTZ,
  processed_at              TIMESTAMPTZ,
  error_message             TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  workflow_id               UUID,
  CONSTRAINT pk_lead_capture_leads PRIMARY KEY (id)
);

CREATE TABLE public.workflow_runs (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  workflow_id               UUID,
  contact_id                UUID,
  status                    run_status DEFAULT running,
  context                   JSONB,
  current_node              TEXT,
  wake_at                   TIMESTAMPTZ,
  started_at                TIMESTAMPTZ DEFAULT now(),
  finished_at               TIMESTAMPTZ,
  CONSTRAINT pk_workflow_runs PRIMARY KEY (id)
);

CREATE TABLE public.chatbot_settings (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  bot_name                  TEXT DEFAULT Aria,
  persona                   TEXT,
  language                  TEXT DEFAULT auto,
  response_length           INTEGER DEFAULT 65,
  fallback_message          TEXT,
  is_active                 BOOLEAN DEFAULT true,
  gemini_api_key            TEXT,
  model                     TEXT DEFAULT gemini-2.5-flash,
  temperature               NUMERIC DEFAULT 0.7,
  max_tokens                INTEGER DEFAULT 1024,
  use_knowledge_base        BOOLEAN DEFAULT true,
  whatsapp_enabled          BOOLEAN DEFAULT true,
  web_widget_enabled        BOOLEAN DEFAULT false,
  escalation_enabled        BOOLEAN DEFAULT true,
  escalation_trigger        TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_chatbot_settings PRIMARY KEY (id)
);

CREATE TABLE public.voice_agent_settings (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  voice_id                  TEXT DEFAULT anushka,
  agent_type                TEXT DEFAULT livekit,
  language_preset           TEXT DEFAULT hinglish,
  sarvam_language           TEXT DEFAULT hi-IN,
  deepgram_language         TEXT DEFAULT hi,
  system_prompt             TEXT,
  call_objective            TEXT,
  calling_hours_start       TIME DEFAULT 09:00:00,
  calling_hours_end         TIME DEFAULT 19:00:00,
  max_call_attempts         INTEGER DEFAULT 3,
  retry_interval_minutes    INTEGER DEFAULT 60,
  recording_enabled         BOOLEAN DEFAULT true,
  transcription_enabled     BOOLEAN DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_voice_agent_settings PRIMARY KEY (id)
);

CREATE TABLE public.conversation_notes (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  conversation_id           UUID,
  author_id                 UUID,
  body                      TEXT,
  mentions                  TEXT[],
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_conversation_notes PRIMARY KEY (id)
);

CREATE TABLE public.invitations (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  email                     TEXT,
  role                      member_role DEFAULT agent,
  permissions               JSONB,
  credit_limit              INTEGER,
  token                     TEXT DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text),
  invited_by                UUID,
  accepted_at               TIMESTAMPTZ,
  expires_at                TIMESTAMPTZ DEFAULT (now() + '7 days'::interval),
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_invitations PRIMARY KEY (id)
);

CREATE TABLE public.campaign_schedules (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  campaign_id               UUID,
  name                      TEXT,
  template_name             TEXT,
  template_language         TEXT DEFAULT en,
  recipients_filter         JSONB,
  recipient_count           INTEGER DEFAULT 0,
  status                    TEXT DEFAULT scheduled,
  scheduled_at              TIMESTAMPTZ,
  timezone                  TEXT DEFAULT UTC,
  is_recurring              BOOLEAN DEFAULT false,
  recurrence_rule           TEXT,
  sent_count                INTEGER DEFAULT 0,
  delivered_count           INTEGER DEFAULT 0,
  failed_count              INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_campaign_schedules PRIMARY KEY (id)
);

CREATE TABLE public.chatbots (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT DEFAULT Default Assistant,
  is_enabled                BOOLEAN DEFAULT true,
  system_prompt             TEXT,
  model                     TEXT DEFAULT gemini-2.5-flash,
  temperature               NUMERIC DEFAULT 0.7,
  max_tokens                INTEGER DEFAULT 1024,
  knowledge_base_id         UUID,
  tools_config              JSONB,
  prompt_cache_name         TEXT,
  prompt_cache_expires_at   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_chatbots PRIMARY KEY (id)
);

CREATE TABLE public.knowledge_sources (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  type                      TEXT,
  source_url                TEXT,
  file_path                 TEXT,
  status                    TEXT DEFAULT pending,
  error_message             TEXT,
  metadata                  JSONB,
  total_chunks              INTEGER DEFAULT 0,
  total_tokens              INTEGER DEFAULT 0,
  last_synced_at            TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_knowledge_sources PRIMARY KEY (id)
);

CREATE TABLE public.campaign_recipients (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  campaign_id               UUID,
  contact_id                UUID,
  wamid                     TEXT,
  status                    recipient_status DEFAULT pending,
  error_message             TEXT,
  sent_at                   TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  read_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_campaign_recipients PRIMARY KEY (id)
);

CREATE TABLE public.credit_ledger (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  amount                    INTEGER,
  reason                    ledger_reason,
  feature                   TEXT,
  ref_type                  TEXT,
  ref_id                    UUID,
  member_id                 UUID,
  balance_after             INTEGER,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_credit_ledger PRIMARY KEY (id)
);

CREATE TABLE public.campaigns (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  channel                   channel_type DEFAULT whatsapp,
  template_name             TEXT,
  template_language         TEXT DEFAULT en,
  content                   JSONB,
  audience                  JSONB,
  status                    campaign_status DEFAULT draft,
  total_contacts            INTEGER DEFAULT 0,
  sent_count                INTEGER DEFAULT 0,
  delivered_count           INTEGER DEFAULT 0,
  read_count                INTEGER DEFAULT 0,
  failed_count              INTEGER DEFAULT 0,
  click_count               INTEGER DEFAULT 0,
  estimated_credits         INTEGER DEFAULT 0,
  created_by                UUID,
  scheduled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  completed_at              TIMESTAMPTZ,
  CONSTRAINT pk_campaigns PRIMARY KEY (id)
);

CREATE TABLE public.inbox_routing_rules (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  rule_type                 TEXT,
  conditions                JSONB,
  action                    JSONB,
  priority                  INTEGER DEFAULT 0,
  is_active                 BOOLEAN DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_inbox_routing_rules PRIMARY KEY (id)
);

CREATE TABLE public.workflow_run_steps (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  run_id                    UUID,
  node_id                   TEXT,
  node_type                 TEXT,
  status                    TEXT,
  input                     JSONB,
  output                    JSONB,
  credits_used              INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_workflow_run_steps PRIMARY KEY (id)
);

CREATE TABLE public.chatbot_faqs (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  question                  TEXT,
  answer                    TEXT,
  is_active                 BOOLEAN DEFAULT true,
  match_type                TEXT DEFAULT contains,
  priority                  INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_chatbot_faqs PRIMARY KEY (id)
);

CREATE TABLE public.invoices (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  stripe_invoice_id         TEXT,
  amount_cents              INTEGER,
  currency                  TEXT DEFAULT usd,
  status                    TEXT,
  pdf_url                   TEXT,
  period_start              TIMESTAMPTZ,
  period_end                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_invoices PRIMARY KEY (id)
);

CREATE TABLE public.dashboard_daily_metrics (
  workspace_id              UUID,
  day                       DATE,
  conversations             INTEGER DEFAULT 0,
  messages                  INTEGER DEFAULT 0,
  leads                     INTEGER DEFAULT 0,
  voice_calls               INTEGER DEFAULT 0,
  credits_used              INTEGER DEFAULT 0,
  revenue_cents             INTEGER DEFAULT 0,
  CONSTRAINT pk_dashboard_daily_metrics PRIMARY KEY (workspace_id, day)
);

CREATE TABLE public.kg_edges (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  knowledge_base_id         UUID,
  source_id                 UUID,
  target_id                 UUID,
  relation                  TEXT,
  weight                    NUMERIC DEFAULT 1,
  CONSTRAINT pk_kg_edges PRIMARY KEY (id)
);

CREATE TABLE public.workflows (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  description               TEXT,
  status                    workflow_status DEFAULT draft,
  trigger_type              TEXT,
  trigger_config            JSONB,
  graph                     JSONB,
  version                   INTEGER DEFAULT 1,
  created_by                UUID,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_workflows PRIMARY KEY (id)
);

CREATE TABLE public.voice_transcripts (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  call_id                   UUID,
  role                      TEXT,
  text                      TEXT,
  ts_ms                     INTEGER,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_voice_transcripts PRIMARY KEY (id)
);

CREATE TABLE public.webhooks (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  url                       TEXT,
  events                    TEXT[],
  secret                    TEXT DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text),
  is_active                 BOOLEAN DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_webhooks PRIMARY KEY (id)
);

CREATE TABLE public.plans (
  id                        UUID,
  name                      TEXT,
  monthly_credits           INTEGER DEFAULT 0,
  price_inr_paise           INTEGER DEFAULT 0,
  features                  JSONB,
  razorpay_plan_id          TEXT,
  CONSTRAINT pk_plans PRIMARY KEY (id)
);

CREATE TABLE public.voice_agents (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT DEFAULT Default Voice Agent,
  is_enabled                BOOLEAN DEFAULT true,
  agent_type                voice_agent_type DEFAULT livekit,
  voice_id                  TEXT DEFAULT anushka,
  cloned_voice_id           UUID,
  system_prompt             TEXT,
  knowledge_base_id         UUID,
  first_message             TEXT,
  vapi_assistant_id         TEXT,
  config                    JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_voice_agents PRIMARY KEY (id)
);

CREATE TABLE public.messages (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  thread_id                 UUID,
  wa_message_id             TEXT,
  content                   TEXT,
  type                      TEXT DEFAULT text,
  sender_type               TEXT,
  sender_id                 UUID,
  status                    TEXT DEFAULT sent,
  file_url                  TEXT,
  file_name                 TEXT,
  file_size                 INTEGER,
  thumbnail_url             TEXT,
  metadata                  JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_messages PRIMARY KEY (id)
);

CREATE TABLE public.kg_nodes (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  knowledge_base_id         UUID,
  label                     TEXT,
  type                      TEXT,
  properties                JSONB,
  CONSTRAINT pk_kg_nodes PRIMARY KEY (id)
);

CREATE TABLE public.webhook_deliveries (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  webhook_id                UUID,
  event                     TEXT,
  payload                   JSONB,
  response_code             INTEGER,
  attempts                  INTEGER DEFAULT 0,
  delivered_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_webhook_deliveries PRIMARY KEY (id)
);

CREATE TABLE public.chatbot_prompt_history (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  chatbot_id                UUID,
  system_prompt             TEXT,
  created_by                UUID,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_chatbot_prompt_history PRIMARY KEY (id)
);

CREATE TABLE public.credit_wallets (
  workspace_id              UUID,
  balance                   INTEGER DEFAULT 0,
  monthly_grant             INTEGER DEFAULT 0,
  period_start              TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_credit_wallets PRIMARY KEY (workspace_id)
);

CREATE TABLE public.workspace_settings (
  workspace_id              UUID,
  business_hours            JSONB,
  default_language          TEXT DEFAULT en,
  auto_assign               BOOLEAN DEFAULT true,
  notification_prefs        JSONB,
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_workspace_settings PRIMARY KEY (workspace_id)
);

CREATE TABLE public.api_keys (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  key_prefix                TEXT,
  key_hash                  TEXT,
  scopes                    TEXT[],
  last_used_at              TIMESTAMPTZ,
  created_by                UUID,
  revoked_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_api_keys PRIMARY KEY (id)
);

CREATE TABLE public.lead_capture_settings (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  is_active                 BOOLEAN DEFAULT true,
  sheet_url                 TEXT,
  phone_column              TEXT,
  name_column               TEXT,
  email_column              TEXT,
  delay_minutes             INTEGER DEFAULT 0,
  whatsapp_enabled          BOOLEAN DEFAULT true,
  template_name             TEXT,
  template_language         TEXT DEFAULT en,
  email_enabled             BOOLEAN DEFAULT false,
  email_template_id         TEXT,
  email_subject             TEXT,
  email_brand_name          TEXT,
  email_logo_url            TEXT,
  email_title               TEXT,
  email_body                TEXT,
  email_button_text         TEXT,
  email_button_url          TEXT,
  email_footer              TEXT,
  email_from                TEXT,
  email_from_name           TEXT,
  smtp_host                 TEXT,
  smtp_port                 INTEGER,
  smtp_user                 TEXT,
  smtp_password             TEXT,
  voice_enabled             BOOLEAN DEFAULT false,
  voice_agent_type          voice_agent_type DEFAULT livekit,
  voice_id                  TEXT DEFAULT anushka,
  voice_prompt              TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_lead_capture_settings PRIMARY KEY (id)
);

CREATE TABLE public.activities (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  contact_id                UUID,
  actor_id                  UUID,
  type                      TEXT,
  payload                   JSONB,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_activities PRIMARY KEY (id)
);

CREATE TABLE public.ticket_tags (
  id                        UUID DEFAULT extensions.uuid_generate_v4(),
  ticket_id                 UUID,
  workspace_id              UUID,
  tagged_user_id            UUID,
  tagged_by                 UUID,
  reason                    TEXT,
  is_read                   BOOLEAN DEFAULT false,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_ticket_tags PRIMARY KEY (id)
);

CREATE TABLE public.knowledge_bases (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  name                      TEXT,
  description               TEXT,
  embedding_model           TEXT DEFAULT text-embedding-004,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_knowledge_bases PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  user_id                   UUID,
  type                      TEXT,
  title                     TEXT,
  body                      TEXT,
  data                      JSONB,
  read_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_notifications PRIMARY KEY (id)
);

CREATE TABLE public.conversations (
  id                        UUID DEFAULT gen_random_uuid(),
  workspace_id              UUID,
  contact_id                UUID,
  channel                   channel_type DEFAULT whatsapp,
  state                     conversation_state DEFAULT open,
  assigned_to               UUID,
  is_bot_active             BOOLEAN DEFAULT true,
  human_requested           BOOLEAN DEFAULT false,
  tags                      TEXT[],
  last_message_at           TIMESTAMPTZ,
  last_message_preview      TEXT,
  unread_count              INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT pk_conversations PRIMARY KEY (id)
);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================
ALTER TABLE public.workspaces ADD CONSTRAINT fk_workspaces_owner_id FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.integrations ADD CONSTRAINT fk_integrations_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD CONSTRAINT fk_contacts_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.contacts ADD CONSTRAINT fk_contacts_owner_id FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.workspace_members ADD CONSTRAINT fk_workspace_members_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_members ADD CONSTRAINT fk_workspace_members_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.voice_calls ADD CONSTRAINT fk_voice_calls_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.voice_calls ADD CONSTRAINT fk_voice_calls_voice_agent_id FOREIGN KEY (voice_agent_id) REFERENCES public.voice_agents(id) ON DELETE SET NULL;
ALTER TABLE public.voice_calls ADD CONSTRAINT fk_voice_calls_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.voice_calls ADD CONSTRAINT fk_voice_calls_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT fk_subscriptions_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD CONSTRAINT fk_pipeline_stages_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.pipeline_stages ADD CONSTRAINT fk_pipeline_stages_pipeline_id FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT fk_knowledge_documents_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_documents ADD CONSTRAINT fk_knowledge_documents_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.cloned_voices ADD CONSTRAINT fk_cloned_voices_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.cloned_voices ADD CONSTRAINT fk_cloned_voices_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_pipeline_id FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_stage_id FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD CONSTRAINT fk_leads_owner_id FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.channel_connections ADD CONSTRAINT fk_channel_connections_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.threads ADD CONSTRAINT fk_threads_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.ticket_events ADD CONSTRAINT fk_ticket_events_ticket_id FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
ALTER TABLE public.canned_replies ADD CONSTRAINT fk_canned_replies_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.canned_replies ADD CONSTRAINT fk_canned_replies_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log ADD CONSTRAINT fk_audit_log_actor_id FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT fk_knowledge_chunks_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT fk_knowledge_chunks_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_chunks ADD CONSTRAINT fk_knowledge_chunks_document_id FOREIGN KEY (document_id) REFERENCES public.knowledge_documents(id) ON DELETE CASCADE;
ALTER TABLE public.pipelines ADD CONSTRAINT fk_pipelines_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_thread_id FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE SET NULL;
ALTER TABLE public.tickets ADD CONSTRAINT fk_tickets_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.lead_capture_leads ADD CONSTRAINT fk_lead_capture_leads_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.lead_capture_leads ADD CONSTRAINT fk_lead_capture_leads_lead_capture_settings_id FOREIGN KEY (lead_capture_settings_id) REFERENCES public.lead_capture_settings(id) ON DELETE SET NULL;
ALTER TABLE public.workflow_runs ADD CONSTRAINT fk_workflow_runs_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_runs ADD CONSTRAINT fk_workflow_runs_workflow_id FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_runs ADD CONSTRAINT fk_workflow_runs_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.chatbot_settings ADD CONSTRAINT fk_chatbot_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.voice_agent_settings ADD CONSTRAINT fk_voice_agent_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_notes ADD CONSTRAINT fk_conversation_notes_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.conversation_notes ADD CONSTRAINT fk_conversation_notes_conversation_id FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;
ALTER TABLE public.conversation_notes ADD CONSTRAINT fk_conversation_notes_author_id FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT fk_invitations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD CONSTRAINT fk_invitations_invited_by FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.campaign_schedules ADD CONSTRAINT fk_campaign_schedules_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.chatbots ADD CONSTRAINT fk_chatbots_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.chatbots ADD CONSTRAINT fk_chatbots_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_sources ADD CONSTRAINT fk_knowledge_sources_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.campaign_recipients ADD CONSTRAINT fk_campaign_recipients_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.campaign_recipients ADD CONSTRAINT fk_campaign_recipients_campaign_id FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.campaign_recipients ADD CONSTRAINT fk_campaign_recipients_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.credit_ledger ADD CONSTRAINT fk_credit_ledger_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.credit_ledger ADD CONSTRAINT fk_credit_ledger_member_id FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD CONSTRAINT fk_campaigns_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.campaigns ADD CONSTRAINT fk_campaigns_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.inbox_routing_rules ADD CONSTRAINT fk_inbox_routing_rules_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_run_steps ADD CONSTRAINT fk_workflow_run_steps_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_run_steps ADD CONSTRAINT fk_workflow_run_steps_run_id FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE SET NULL;
ALTER TABLE public.chatbot_faqs ADD CONSTRAINT fk_chatbot_faqs_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT fk_invoices_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.dashboard_daily_metrics ADD CONSTRAINT fk_dashboard_daily_metrics_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_source_id FOREIGN KEY (source_id) REFERENCES public.kg_nodes(id) ON DELETE CASCADE;
ALTER TABLE public.kg_edges ADD CONSTRAINT fk_kg_edges_target_id FOREIGN KEY (target_id) REFERENCES public.kg_nodes(id) ON DELETE SET NULL;
ALTER TABLE public.workflows ADD CONSTRAINT fk_workflows_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workflows ADD CONSTRAINT fk_workflows_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.voice_transcripts ADD CONSTRAINT fk_voice_transcripts_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.voice_transcripts ADD CONSTRAINT fk_voice_transcripts_call_id FOREIGN KEY (call_id) REFERENCES public.voice_calls(id) ON DELETE SET NULL;
ALTER TABLE public.webhooks ADD CONSTRAINT fk_webhooks_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.voice_agents ADD CONSTRAINT fk_voice_agents_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.voice_agents ADD CONSTRAINT fk_voice_agents_cloned_voice_id FOREIGN KEY (cloned_voice_id) REFERENCES public.cloned_voices(id) ON DELETE SET NULL;
ALTER TABLE public.voice_agents ADD CONSTRAINT fk_voice_agents_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT fk_messages_thread_id FOREIGN KEY (thread_id) REFERENCES public.threads(id) ON DELETE SET NULL;
ALTER TABLE public.kg_nodes ADD CONSTRAINT fk_kg_nodes_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.kg_nodes ADD CONSTRAINT fk_kg_nodes_knowledge_base_id FOREIGN KEY (knowledge_base_id) REFERENCES public.knowledge_bases(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_webhook_id FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;
ALTER TABLE public.chatbot_prompt_history ADD CONSTRAINT fk_chatbot_prompt_history_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.chatbot_prompt_history ADD CONSTRAINT fk_chatbot_prompt_history_chatbot_id FOREIGN KEY (chatbot_id) REFERENCES public.chatbots(id) ON DELETE SET NULL;
ALTER TABLE public.chatbot_prompt_history ADD CONSTRAINT fk_chatbot_prompt_history_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.credit_wallets ADD CONSTRAINT fk_credit_wallets_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.workspace_settings ADD CONSTRAINT fk_workspace_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.api_keys ADD CONSTRAINT fk_api_keys_created_by FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.lead_capture_settings ADD CONSTRAINT fk_lead_capture_settings_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.activities ADD CONSTRAINT fk_activities_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.activities ADD CONSTRAINT fk_activities_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.activities ADD CONSTRAINT fk_activities_actor_id FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ticket_tags ADD CONSTRAINT fk_ticket_tags_ticket_id FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_bases ADD CONSTRAINT fk_knowledge_bases_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_workspace_id FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_contact_id FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.conversations ADD CONSTRAINT fk_conversations_assigned_to FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_integrations_workspace_id ON public.integrations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_integrations_created_by ON public.integrations(created_by);
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_id ON public.contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON public.contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_workspace_id ON public.voice_calls(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_voice_agent_id ON public.voice_calls(voice_agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_contact_id ON public.voice_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_user_id ON public.voice_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_id ON public.subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace_id ON public.pipeline_stages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id ON public.pipeline_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_workspace_id ON public.knowledge_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_knowledge_base_id ON public.knowledge_documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voices_workspace_id ON public.cloned_voices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cloned_voices_created_by ON public.cloned_voices(created_by);
CREATE INDEX IF NOT EXISTS idx_leads_workspace_id ON public.leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON public.leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_id ON public.leads(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage_id ON public.leads(stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON public.leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_channel_connections_workspace_id ON public.channel_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_threads_workspace_id ON public.threads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_threads_contact_id ON public.threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON public.ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_canned_replies_workspace_id ON public.canned_replies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_canned_replies_created_by ON public.canned_replies(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_id ON public.audit_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_workspace_id ON public.knowledge_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_knowledge_base_id ON public.knowledge_chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document_id ON public.knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_workspace_id ON public.pipelines(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_workspace_id ON public.tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_thread_id ON public.tickets(thread_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contact_id ON public.tickets(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_capture_leads_workspace_id ON public.lead_capture_leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_capture_leads_lead_capture_settings_id ON public.lead_capture_leads(lead_capture_settings_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workspace_id ON public.workflow_runs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_contact_id ON public.workflow_runs(contact_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_settings_workspace_id ON public.chatbot_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voice_agent_settings_workspace_id ON public.voice_agent_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_workspace_id ON public.conversation_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_conversation_id ON public.conversation_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_notes_author_id ON public.conversation_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_invitations_workspace_id ON public.invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON public.invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_workspace_id ON public.campaign_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_workspace_id ON public.chatbots(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbots_knowledge_base_id ON public.chatbots(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sources_workspace_id ON public.knowledge_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_workspace_id ON public.campaign_recipients(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact_id ON public.campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_workspace_id ON public.credit_ledger(workspace_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_member_id ON public.credit_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace_id ON public.campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON public.campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_inbox_routing_rules_workspace_id ON public.inbox_routing_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_workspace_id ON public.workflow_run_steps(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run_id ON public.workflow_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_faqs_workspace_id ON public.chatbot_faqs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_id ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_daily_metrics_workspace_id ON public.dashboard_daily_metrics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_workspace_id ON public.kg_edges(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_knowledge_base_id ON public.kg_edges(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_source_id ON public.kg_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_kg_edges_target_id ON public.kg_edges(target_id);
CREATE INDEX IF NOT EXISTS idx_workflows_workspace_id ON public.workflows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON public.workflows(created_by);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_workspace_id ON public.voice_transcripts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcripts_call_id ON public.voice_transcripts(call_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_workspace_id ON public.webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_workspace_id ON public.voice_agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_cloned_voice_id ON public.voice_agents(cloned_voice_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_knowledge_base_id ON public.voice_agents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_messages_workspace_id ON public.messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_workspace_id ON public.kg_nodes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_kg_nodes_knowledge_base_id ON public.kg_nodes(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_workspace_id ON public.webhook_deliveries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON public.webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompt_history_workspace_id ON public.chatbot_prompt_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompt_history_chatbot_id ON public.chatbot_prompt_history(chatbot_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_prompt_history_created_by ON public.chatbot_prompt_history(created_by);
CREATE INDEX IF NOT EXISTS idx_credit_wallets_workspace_id ON public.credit_wallets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_settings_workspace_id ON public.workspace_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_id ON public.api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by ON public.api_keys(created_by);
CREATE INDEX IF NOT EXISTS idx_lead_capture_settings_workspace_id ON public.lead_capture_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activities_workspace_id ON public.activities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON public.activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_actor_id ON public.activities(actor_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket_id ON public.ticket_tags(ticket_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_workspace_id ON public.knowledge_bases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON public.notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_id ON public.conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to);

-- Custom Special Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_search ON public.contacts USING gin(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email,'') || ' ' || coalesce(company,'')));
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- 1. updated_at touch function
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- Create touch triggers for all tables with updated_at
CREATE TRIGGER trg_workspaces_touch BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_integrations_touch BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_subscriptions_touch BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cloned_voices_touch BEFORE UPDATE ON public.cloned_voices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_leads_touch BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_channel_connections_touch BEFORE UPDATE ON public.channel_connections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_threads_touch BEFORE UPDATE ON public.threads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tickets_touch BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_chatbot_settings_touch BEFORE UPDATE ON public.chatbot_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_voice_agent_settings_touch BEFORE UPDATE ON public.voice_agent_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_campaign_schedules_touch BEFORE UPDATE ON public.campaign_schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_chatbots_touch BEFORE UPDATE ON public.chatbots FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_knowledge_sources_touch BEFORE UPDATE ON public.knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_campaigns_touch BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_inbox_routing_rules_touch BEFORE UPDATE ON public.inbox_routing_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_chatbot_faqs_touch BEFORE UPDATE ON public.chatbot_faqs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_workflows_touch BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_voice_agents_touch BEFORE UPDATE ON public.voice_agents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_credit_wallets_touch BEFORE UPDATE ON public.credit_wallets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_workspace_settings_touch BEFORE UPDATE ON public.workspace_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_lead_capture_settings_touch BEFORE UPDATE ON public.lead_capture_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (new.id, new.email,
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. is_workspace_member helper
CREATE OR REPLACE FUNCTION public.is_workspace_member(ws UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ws AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4. auth_has_role helper
CREATE OR REPLACE FUNCTION public.auth_has_role(ws UUID, required_role TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ws AND m.user_id = auth.uid() AND m.status = 'active'
      AND (m.role::TEXT = required_role OR m.role IN ('owner','admin'))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 5. auth_has_permission helper
CREATE OR REPLACE FUNCTION public.auth_has_permission(ws UUID, perm TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = ws AND m.user_id = auth.uid() AND m.status = 'active'
      AND (m.role IN ('owner','admin')
           OR COALESCE((m.permissions #>> string_to_array(perm,'.'))::BOOLEAN, FALSE))
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 6. increment_unread helper
CREATE OR REPLACE FUNCTION public.increment_unread(thread_id UUID) RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
BEGIN
  SELECT unread_count INTO current_count FROM public.threads WHERE id = thread_id;
  RETURN COALESCE(current_count, 0) + 1;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. increment_message_count helper
CREATE OR REPLACE FUNCTION public.increment_message_count(contact_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE public.contacts SET message_count = message_count + 1, last_message_at = NOW()
  WHERE id = contact_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. increment_campaign_count helper
CREATE OR REPLACE FUNCTION public.increment_campaign_count(p_campaign_id UUID, p_field TEXT) RETURNS VOID AS $$
BEGIN
  IF p_field = 'delivered_count' THEN
    UPDATE public.campaigns SET delivered_count = delivered_count + 1 WHERE id = p_campaign_id;
  ELSIF p_field = 'read_count' THEN
    UPDATE public.campaigns SET read_count = read_count + 1 WHERE id = p_campaign_id;
  ELSIF p_field = 'failed_count' THEN
    UPDATE public.campaigns SET failed_count = failed_count + 1 WHERE id = p_campaign_id;
  END IF;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. match_knowledge_chunks vector similarity function
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding public.vector(768),
  workspace_id_param UUID,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  source_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.document_id as source_id,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE
    kc.workspace_id = workspace_id_param
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. debit_credits transaction ledger helper
CREATE OR REPLACE FUNCTION public.debit_credits(
  ws UUID, amt INTEGER, p_feature TEXT, p_ref_type TEXT, p_ref_id UUID, p_member UUID DEFAULT NULL
, p_reason public.ledger_reason DEFAULT 'debit') RETURNS INTEGER AS $$
DECLARE new_bal INTEGER;
BEGIN
  UPDATE public.credit_wallets
    SET balance = balance - amt, updated_at = NOW()
    WHERE workspace_id = ws AND balance >= amt
    RETURNING balance INTO new_bal;
  IF new_bal IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;
  INSERT INTO public.credit_ledger(workspace_id, amount, reason, feature, ref_type, ref_id, member_id, balance_after)
    VALUES (ws, -amt, p_reason, p_feature, p_ref_type, p_ref_id, p_member, new_bal);
  RETURN new_bal;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloned_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canned_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_capture_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kg_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kg_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_capture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 1. profiles policies
CREATE POLICY profiles_self ON public.profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 2. workspaces policies
CREATE POLICY ws_read ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));
CREATE POLICY ws_write ON public.workspaces FOR UPDATE TO authenticated USING (owner_id = auth.uid());

-- 3. workspace_members policies
CREATE POLICY wm_read ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY wm_write ON public.workspace_members FOR ALL TO authenticated USING (public.auth_has_role(workspace_id, 'admin'));

-- 4. invitations policies
CREATE POLICY inv_admin ON public.invitations FOR ALL TO authenticated USING (public.auth_has_role(workspace_id, 'admin'));

-- 5. Generic tenant member policy for all other workspace-scoped tables
CREATE POLICY policy_integrations_member ON public.integrations FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_contacts_member ON public.contacts FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_voice_calls_member ON public.voice_calls FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_subscriptions_member ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_pipeline_stages_member ON public.pipeline_stages FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_knowledge_documents_member ON public.knowledge_documents FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_cloned_voices_member ON public.cloned_voices FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_leads_member ON public.leads FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_channel_connections_member ON public.channel_connections FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_threads_member ON public.threads FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_ticket_events_member ON public.ticket_events FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_canned_replies_member ON public.canned_replies FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_audit_log_member ON public.audit_log FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_knowledge_chunks_member ON public.knowledge_chunks FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_pipelines_member ON public.pipelines FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_tickets_member ON public.tickets FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_lead_capture_leads_member ON public.lead_capture_leads FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_workflow_runs_member ON public.workflow_runs FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_chatbot_settings_member ON public.chatbot_settings FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_voice_agent_settings_member ON public.voice_agent_settings FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_conversation_notes_member ON public.conversation_notes FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_campaign_schedules_member ON public.campaign_schedules FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_chatbots_member ON public.chatbots FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_knowledge_sources_member ON public.knowledge_sources FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_campaign_recipients_member ON public.campaign_recipients FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_credit_ledger_member ON public.credit_ledger FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_campaigns_member ON public.campaigns FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_inbox_routing_rules_member ON public.inbox_routing_rules FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_workflow_run_steps_member ON public.workflow_run_steps FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_chatbot_faqs_member ON public.chatbot_faqs FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_invoices_member ON public.invoices FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_dashboard_daily_metrics_member ON public.dashboard_daily_metrics FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_kg_edges_member ON public.kg_edges FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_workflows_member ON public.workflows FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_voice_transcripts_member ON public.voice_transcripts FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_webhooks_member ON public.webhooks FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_voice_agents_member ON public.voice_agents FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_messages_member ON public.messages FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_kg_nodes_member ON public.kg_nodes FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_webhook_deliveries_member ON public.webhook_deliveries FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_chatbot_prompt_history_member ON public.chatbot_prompt_history FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_credit_wallets_member ON public.credit_wallets FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_workspace_settings_member ON public.workspace_settings FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_api_keys_member ON public.api_keys FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_lead_capture_settings_member ON public.lead_capture_settings FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_activities_member ON public.activities FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_ticket_tags_member ON public.ticket_tags FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_knowledge_bases_member ON public.knowledge_bases FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_notifications_member ON public.notifications FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY policy_conversations_member ON public.conversations FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id))
  WITH CHECK (public.is_workspace_member(workspace_id));

-- Service Role overrides (bypass RLS)
CREATE POLICY service_role_workspaces ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_integrations ON public.integrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_contacts ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workspace_members ON public.workspace_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_voice_calls ON public.voice_calls FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_subscriptions ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workflow_templates ON public.workflow_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pipeline_stages ON public.pipeline_stages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_knowledge_documents ON public.knowledge_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_cloned_voices ON public.cloned_voices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_leads ON public.leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_channel_connections ON public.channel_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_threads ON public.threads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_ticket_events ON public.ticket_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_canned_replies ON public.canned_replies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_audit_log ON public.audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_knowledge_chunks ON public.knowledge_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_profiles ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_pipelines ON public.pipelines FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_tickets ON public.tickets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_lead_capture_leads ON public.lead_capture_leads FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workflow_runs ON public.workflow_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_chatbot_settings ON public.chatbot_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_voice_agent_settings ON public.voice_agent_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_conversation_notes ON public.conversation_notes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_invitations ON public.invitations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_campaign_schedules ON public.campaign_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_chatbots ON public.chatbots FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_knowledge_sources ON public.knowledge_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_campaign_recipients ON public.campaign_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_credit_ledger ON public.credit_ledger FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_campaigns ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_inbox_routing_rules ON public.inbox_routing_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workflow_run_steps ON public.workflow_run_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_chatbot_faqs ON public.chatbot_faqs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_invoices ON public.invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_dashboard_daily_metrics ON public.dashboard_daily_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_kg_edges ON public.kg_edges FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workflows ON public.workflows FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_voice_transcripts ON public.voice_transcripts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_webhooks ON public.webhooks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_plans ON public.plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_voice_agents ON public.voice_agents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_messages ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_kg_nodes ON public.kg_nodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_webhook_deliveries ON public.webhook_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_chatbot_prompt_history ON public.chatbot_prompt_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_credit_wallets ON public.credit_wallets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workspace_settings ON public.workspace_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_api_keys ON public.api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_lead_capture_settings ON public.lead_capture_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_activities ON public.activities FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_ticket_tags ON public.ticket_tags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_knowledge_bases ON public.knowledge_bases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_notifications ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_conversations ON public.conversations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- REALTIME PUBLICATION
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_wallets;

-- ============================================================================
-- SEED DATA
-- ============================================================================
INSERT INTO public.plans (id, name, monthly_credits, price_cents, stripe_price_id) VALUES
  ('free', 'Free', 1000, 0, NULL),
  ('pro', 'Pro', 10000, 4900, NULL),
  ('business', 'Business', 50000, 19900, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres, service_role;

-- END OF SCHEMA