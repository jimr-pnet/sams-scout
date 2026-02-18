-- Migration 008: Add web_scrape source type
--
-- Adds 'web_scrape' to the allowed source_type values for briefing_sources
-- and briefing_raw_items, enabling HTML scraping of blogs and resource pages
-- that lack reliable RSS feeds.

ALTER TABLE briefing_sources DROP CONSTRAINT IF EXISTS briefing_sources_source_type_check;
ALTER TABLE briefing_sources ADD CONSTRAINT briefing_sources_source_type_check
  CHECK (source_type IN ('rss', 'podcast_transcript', 'youtube_channel', 'web_scrape'));

ALTER TABLE briefing_raw_items DROP CONSTRAINT IF EXISTS briefing_raw_items_source_type_check;
ALTER TABLE briefing_raw_items ADD CONSTRAINT briefing_raw_items_source_type_check
  CHECK (source_type IN ('rss', 'web_search', 'podcast_transcript', 'youtube_transcript', 'web_scrape'));
