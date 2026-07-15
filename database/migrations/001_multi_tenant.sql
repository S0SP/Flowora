-- ============================================================================
-- FLOWORA — Migration 001: Multi-tenant foundation
-- Run this in Supabase SQL Editor AFTER the base schema.sql
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- PROFILES — 1:1 mirror of auth.users
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  phone         TEXT,
  timezone      TEXT DEFAULT 'Asia/Kolkata',
  locale        TEXT DEFAULT 'en',
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WORKSPACES — the tenant
-- ============================================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  logo_url      TEXT,
  industry      TEXT,
  timezone      TEXT DEFAULT 'Asia/Kolkata',
  owner_id      UUID NOT NULL REFERENCES profiles(id),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- WORKSPACE_MEMBERS — role + permissions + credit limit
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_role') THEN
    CREATE TYPE member_role AS ENUM ('owner','admin','manager','agent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
    CREATE TYPE member_status AS ENUM ('active','invited','suspended');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role          member_role NOT NULL DEFAULT 'agent',
  status        member_status NOT NULL DEFAULT 'active',
  permissions   JSONB NOT NULL DEFAULT '{}'::JSONB,
  credit_limit  INTEGER,
  credits_used  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_ws   ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- ============================================================================
-- INVITATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          member_role NOT NULL DEFAULT 'agent',
  permissions   JSONB NOT NULL DEFAULT '{}'::JSONB,
  token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by    UUID REFERENCES profiles(id),
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, email)
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- ============================================================================
-- WORKSPACE_SETTINGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  business_hours    JSONB DEFAULT '{}'::JSONB,
  default_language  TEXT DEFAULT 'en',
  auto_assign       BOOLEAN DEFAULT TRUE,
  notification_prefs JSONB DEFAULT '{}'::JSONB,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id),
  type          TEXT NOT NULL,   -- 'inbox','campaign','lead','system','credits','voice'
  title         TEXT NOT NULL,
  body          TEXT,
  data          JSONB DEFAULT '{}'::JSONB,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(workspace_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES profiles(id),
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     UUID,
  metadata      JSONB DEFAULT '{}'::JSONB,
  ip            INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_ws ON audit_log(workspace_id, created_at DESC);

-- ============================================================================
-- CLONED VOICES (voice cloning support)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clone_status') THEN
    CREATE TYPE clone_status AS ENUM ('processing','ready','failed');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS cloned_voices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  status              clone_status NOT NULL DEFAULT 'processing',
  provider            TEXT DEFAULT 'sarvam',
  provider_voice_id   TEXT,
  sample_url          TEXT,
  preview_url         TEXT,
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cloned_voices_ws ON cloned_voices(workspace_id, status);

-- ============================================================================
-- PLANS (Razorpay)
-- ============================================================================
DROP TABLE IF EXISTS plans CASCADE;
CREATE TABLE IF NOT EXISTS plans (
  id                  TEXT PRIMARY KEY,   -- 'free','pro','business'
  name                TEXT NOT NULL,
  monthly_credits     INTEGER NOT NULL DEFAULT 0,
  price_inr_paise     INTEGER NOT NULL DEFAULT 0,
  features            JSONB DEFAULT '{}'::JSONB,
  razorpay_plan_id    TEXT
);

INSERT INTO plans (id, name, monthly_credits, price_inr_paise) VALUES
  ('free',     'Free',     1000,   0),
  ('pro',      'Pro',      10000,  199900),
  ('business', 'Business', 50000,  499900)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- CREDIT_WALLETS
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_wallets (
  workspace_id  UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  balance       INTEGER NOT NULL DEFAULT 0,
  monthly_grant INTEGER NOT NULL DEFAULT 0,
  period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TRIGGER: updated_at on profiles, workspaces, cloned_voices
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','workspaces','cloned_voices'] LOOP
    EXECUTE FORMAT('
      DROP TRIGGER IF EXISTS %1$I_touch ON %1$I;
      CREATE TRIGGER %1$I_touch BEFORE UPDATE ON %1$I
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
    ', t);
  END LOOP;
END $$;

-- ============================================================================
-- TRIGGER: create profile on auth.users insert
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- RLS HELPERS
-- ============================================================================
CREATE OR REPLACE FUNCTION is_workspace_member(ws UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = ws AND m.user_id = auth.uid() AND m.status = 'active'
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth_has_role(ws UUID, required_role TEXT) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.workspace_id = ws AND m.user_id = auth.uid() AND m.status = 'active'
      AND (m.role::TEXT = required_role OR m.role IN ('owner','admin'))
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloned_voices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_wallets     ENABLE ROW LEVEL SECURITY;

-- profiles: own row only
DROP POLICY IF EXISTS profiles_self ON profiles;
CREATE POLICY profiles_self ON profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- workspaces: members can read; owners can update
DROP POLICY IF EXISTS ws_member_read ON workspaces;
CREATE POLICY ws_member_read ON workspaces FOR SELECT TO authenticated
  USING (is_workspace_member(id));
DROP POLICY IF EXISTS ws_owner_write ON workspaces;
CREATE POLICY ws_owner_write ON workspaces FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

-- workspace_members: members read; admin+ manage
DROP POLICY IF EXISTS wm_member_read  ON workspace_members;
CREATE POLICY wm_member_read  ON workspace_members FOR SELECT TO authenticated
  USING (is_workspace_member(workspace_id));
DROP POLICY IF EXISTS wm_admin_write  ON workspace_members;
CREATE POLICY wm_admin_write  ON workspace_members FOR ALL TO authenticated
  USING (auth_has_role(workspace_id,'admin'));

-- invitations: admin+ manage
DROP POLICY IF EXISTS inv_admin ON invitations;
CREATE POLICY inv_admin ON invitations FOR ALL TO authenticated
  USING (auth_has_role(workspace_id,'admin'));

-- workspace_settings, audit_log, notifications, credit_wallets, cloned_voices: membership
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspace_settings','notifications','audit_log','credit_wallets','cloned_voices'
  ] LOOP
    EXECUTE FORMAT($f$
      DROP POLICY IF EXISTS %1$s_member ON %1$I;
      CREATE POLICY %1$s_member ON %1$I FOR ALL TO authenticated
        USING (is_workspace_member(workspace_id))
        WITH CHECK (is_workspace_member(workspace_id));
    $f$, t);
  END LOOP;
END $$;

-- Notifications: also allow the user to see their own personal notifications
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- REALTIME — add new tables
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'credit_wallets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE credit_wallets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cloned_voices'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cloned_voices;
  END IF;
END$$;

