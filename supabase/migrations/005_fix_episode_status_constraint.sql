-- Migration 005: Fix episode status CHECK constraint
--
-- Migration 002 was supposed to add 'generating' to the allowed statuses,
-- but the ALTER TABLE didn't take effect (pg-meta multi-statement issue).
-- This migration re-applies the fix.

ALTER TABLE briefing_episodes DROP CONSTRAINT IF EXISTS briefing_episodes_status_check;

ALTER TABLE briefing_episodes ADD CONSTRAINT briefing_episodes_status_check
  CHECK (status IN ('pending', 'generating', 'generated', 'delivered', 'failed'));
