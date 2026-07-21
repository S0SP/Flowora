-- Migration 019: Fix Presence Offline
-- Update member_presence status check constraint to allow 'offline'

ALTER TABLE member_presence DROP CONSTRAINT IF EXISTS member_presence_status_check;

ALTER TABLE member_presence ADD CONSTRAINT member_presence_status_check 
  CHECK (status IN ('online', 'away', 'offline'));
