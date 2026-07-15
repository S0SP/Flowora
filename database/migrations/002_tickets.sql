-- ============================================================
-- Migration 002: Support Ticket System
-- Workspace-scoped ticket system with events, tags, and audit.
-- Conversation mode is controlled via threads.ai_active (no
-- separate conversation_state table needed in Flowra).
-- ============================================================

-- Add ticket_id to messages table so ticket messages can be tracked
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ticket_id UUID;

-- ── TICKETS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref               BIGINT GENERATED ALWAYS AS IDENTITY,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  thread_id         UUID REFERENCES threads(id) ON DELETE SET NULL,
  contact_id        UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','assigned','in_progress','escalated','resolved','closed')),
  severity          TEXT NOT NULL DEFAULT 'medium'
                      CHECK (severity IN ('low','medium','high','critical')),
  flags             TEXT[] DEFAULT '{}',
  source            TEXT NOT NULL DEFAULT 'ai_escalation'
                      CHECK (source IN ('ai_escalation','manual')),
  escalation_reason TEXT,
  -- stored as workspace_members.user_id (Supabase auth UUID)
  assigned_to       UUID,
  created_by        UUID,
  resolved_by       UUID,
  anchor_message_id UUID,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tickets_contact ON tickets(contact_id);
CREATE INDEX IF NOT EXISTS idx_tickets_thread ON tickets(thread_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(workspace_id, assigned_to);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tickets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_tickets_updated_at();

-- ── TICKET EVENTS (audit trail) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  actor_id     UUID,   -- workspace_members.user_id; NULL = AI/system
  event_type   TEXT NOT NULL CHECK (event_type IN (
                  'created','assigned','reassigned','status_changed',
                  'escalated','tagged','commented','resolved','closed','reopened')),
  from_value   TEXT,
  to_value     TEXT,
  note         TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket ON ticket_events(ticket_id);

-- ── TICKET TAGS (colleague mentions) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_tags (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id      UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL,
  tagged_user_id UUID NOT NULL,   -- workspace_members.user_id
  tagged_by      UUID,            -- workspace_members.user_id
  reason         TEXT,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_tags_ticket ON ticket_tags(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tagged_user ON ticket_tags(workspace_id, tagged_user_id);

-- ── RLS POLICIES ────────────────────────────────────────────────────────────
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_tags ENABLE ROW LEVEL SECURITY;

-- Workspace members can read tickets in their workspace
CREATE POLICY "workspace_members_read_tickets" ON tickets FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "workspace_members_write_tickets" ON tickets FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "workspace_members_read_ticket_events" ON ticket_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "workspace_members_write_ticket_events" ON ticket_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "workspace_members_read_ticket_tags" ON ticket_tags FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "workspace_members_write_ticket_tags" ON ticket_tags FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Allow service role full access (for API routes using admin client)
CREATE POLICY "service_role_tickets" ON tickets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ticket_events" ON ticket_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ticket_tags" ON ticket_tags FOR ALL TO service_role USING (true) WITH CHECK (true);
