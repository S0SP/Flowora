-- ============================================================
-- FLOWORA — Migration 013: workspace_members extended columns
-- Add missing columns required by the Team API:
-- email, full_name, avatar_url, monthly_credit_limit,
-- max_concurrent_chats, credits_used, last_seen_at, updated_at
-- Also user_id becomes nullable for invited (not yet signed up) members
-- ============================================================

-- Make user_id nullable (for invited members who haven't signed up yet)
ALTER TABLE workspace_members
  ALTER COLUMN user_id DROP NOT NULL;

-- Add missing columns if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'email') THEN
    ALTER TABLE workspace_members ADD COLUMN email TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'full_name') THEN
    ALTER TABLE workspace_members ADD COLUMN full_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'avatar_url') THEN
    ALTER TABLE workspace_members ADD COLUMN avatar_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'monthly_credit_limit') THEN
    ALTER TABLE workspace_members ADD COLUMN monthly_credit_limit INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'max_concurrent_chats') THEN
    ALTER TABLE workspace_members ADD COLUMN max_concurrent_chats INTEGER NOT NULL DEFAULT 20;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'credits_used') THEN
    ALTER TABLE workspace_members ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'last_seen_at') THEN
    ALTER TABLE workspace_members ADD COLUMN last_seen_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'updated_at') THEN
    ALTER TABLE workspace_members ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Change 'pending' default to 'invited' for consistency
  -- (API uses 'invited' status for invited-but-not-joined members)
  ALTER TABLE workspace_members
    ALTER COLUMN status SET DEFAULT 'invited';

  -- Add 'credits_used' and 'credit_limit' aliases if old column was named differently
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workspace_members' AND column_name = 'credit_limit') THEN
    ALTER TABLE workspace_members ADD COLUMN credit_limit INTEGER;
  END IF;
END $$;

-- Drop the old unique constraint that required user_id (now nullable)
ALTER TABLE workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_user_id_key;

-- Create partial unique index: unique (workspace_id, user_id) only when user_id is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_workspace_user_id
  ON workspace_members(workspace_id, user_id)
  WHERE user_id IS NOT NULL;

-- Add unique constraint on (workspace_id, email) for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_workspace_email
  ON workspace_members(workspace_id, email)
  WHERE email IS NOT NULL;
