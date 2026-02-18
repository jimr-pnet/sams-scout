-- Migration 006: Deactivate broken RSS feeds
--
-- These feeds were seeded with incorrect or non-existent URLs.
-- The seeder will add correct replacements; this migration disables the old rows.

UPDATE briefing_sources SET active = false WHERE url IN (
  'https://www.anthropic.com/rss.xml',
  'https://www.shopify.com/uk/blog.atom',
  'https://www.retailgentic.com/feed',
  'https://shopify.engineering/blog/feed.atom',
  'https://openai.com/blog/rss.xml'
)
