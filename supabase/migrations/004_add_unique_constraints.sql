-- Migration 004: Add UNIQUE constraints for upsert support
--
-- The startup seeder (lib/seed.js) uses Supabase upsert with onConflict,
-- which requires UNIQUE constraints on the conflict columns.

ALTER TABLE briefing_sources
  ADD CONSTRAINT unique_source_url UNIQUE (url);

ALTER TABLE briefing_search_queries
  ADD CONSTRAINT unique_query_text UNIQUE (query);
