-- Migration 007: Allow multiple episodes per day
--
-- Drops the UNIQUE constraint on briefing_episodes.date so the pipeline
-- can run multiple times per day (e.g. test runs) without overwriting.
-- Each episode still has a UUID primary key and created_at timestamp.

ALTER TABLE briefing_episodes DROP CONSTRAINT briefing_episodes_date_key;
