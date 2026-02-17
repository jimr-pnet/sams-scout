-- PropellerNet Agent Platform: Seed Sources & Queries
-- Migration 002: Populate briefing_sources (RSS feeds) and briefing_search_queries

-- =============================================================================
-- Fix: Add 'generating' to episode status check constraint
-- (used by pipeline between script generation and audio completion)
-- =============================================================================
ALTER TABLE briefing_episodes DROP CONSTRAINT IF EXISTS briefing_episodes_status_check;
ALTER TABLE briefing_episodes ADD CONSTRAINT briefing_episodes_status_check
  CHECK (status IN ('pending', 'generating', 'generated', 'delivered', 'failed'));

-- =============================================================================
-- RSS Sources
-- =============================================================================

-- Retailgentic (Scot Wingo) — Agentic Commerce meets Retail and Brands
INSERT INTO briefing_sources (name, url, source_type, category, active) VALUES
  ('Retailgentic', 'https://www.retailgentic.com/feed', 'rss', 'agentic_commerce', true);

-- Search Engine Land — SEO, PPC, and AI search disruption
INSERT INTO briefing_sources (name, url, source_type, category, active) VALUES
  ('Search Engine Land', 'https://searchengineland.com/feed', 'rss', 'search_marketing', true);

-- Google Ads & Commerce Blog — UCP, AI Mode, ad platform shifts
INSERT INTO briefing_sources (name, url, source_type, category, active) VALUES
  ('Google Ads & Commerce Blog', 'https://blog.google/products/ads-commerce/rss/', 'rss', 'platform_shifts', true);

-- OpenAI Blog — ACP, ChatGPT checkout, agent capabilities
INSERT INTO briefing_sources (name, url, source_type, category, active) VALUES
  ('OpenAI Blog', 'https://openai.com/news/rss.xml', 'rss', 'ai_platforms', true);

-- The Rundown AI — Daily AI news digest, catches major agent launches
INSERT INTO briefing_sources (name, url, source_type, category, active) VALUES
  ('The Rundown AI', 'https://www.therundown.ai/feed', 'rss', 'ai_news', true);

-- =============================================================================
-- Standing Web Search Queries
-- (for sources without RSS, or to supplement RSS with broader coverage)
-- =============================================================================

-- Shopify agentic commerce (no RSS available — 403 blocks)
INSERT INTO briefing_search_queries (query, category, active, added_by) VALUES
  ('Shopify agentic commerce OR agentic storefronts OR AI shopping', 'agentic_commerce', true, 'system');

-- commercetools agentic commerce (no RSS available)
INSERT INTO briefing_search_queries (query, category, active, added_by) VALUES
  ('commercetools agentic commerce OR AgenticLift', 'agentic_commerce', true, 'system');

-- Broad agentic commerce developments
INSERT INTO briefing_search_queries (query, category, active, added_by) VALUES
  ('agentic commerce protocol ACP OR "AI shopping" OR "AI checkout"', 'agentic_commerce', true, 'system');

-- Google AI search and ads disruption
INSERT INTO briefing_search_queries (query, category, active, added_by) VALUES
  ('Google "AI Mode" search OR "Universal Commerce Protocol" OR "AI Overviews" ads', 'platform_shifts', true, 'system');

-- AI-mediated discovery replacing SEO
INSERT INTO briefing_search_queries (query, category, active, added_by) VALUES
  ('AI search optimization OR "generative engine optimization" OR "zero-click" AI', 'search_marketing', true, 'system');

-- ChatGPT / Perplexity as shopping channels
INSERT INTO briefing_search_queries (query, category, active, added_by) VALUES
  ('ChatGPT shopping OR Perplexity shopping OR "AI product discovery"', 'agentic_commerce', true, 'system');
