/**
 * Startup seed verification.
 *
 * Uses the Supabase JS client (not the pg-meta SQL endpoint) to ensure
 * the briefing_sources and briefing_search_queries tables have seed data.
 * Safe to run on every startup — uses upsert with ignoreDuplicates.
 */

const supabase = require('./supabase');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Seed data — combines migration 002 + scripts/seed.js sources
// ---------------------------------------------------------------------------

const rssSources = [
  // Agentic commerce
  { name: 'Retailgentic', url: 'https://www.retailgentic.com/feed', source_type: 'rss', category: 'agentic_commerce' },
  // Search & marketing
  { name: 'Search Engine Land', url: 'https://searchengineland.com/feed', source_type: 'rss', category: 'search_marketing' },
  { name: 'Search Engine Journal', url: 'https://www.searchenginejournal.com/feed/', source_type: 'rss', category: 'search_marketing' },
  { name: 'Marketing AI Institute', url: 'https://www.marketingaiinstitute.com/blog/rss.xml', source_type: 'rss', category: 'ai_marketing' },
  // Platform / company blogs
  { name: 'Google Ads & Commerce Blog', url: 'https://blog.google/products/ads-commerce/rss/', source_type: 'rss', category: 'platform_shifts' },
  { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml', source_type: 'rss', category: 'ai_platforms' },
  { name: 'Anthropic Blog', url: 'https://www.anthropic.com/rss.xml', source_type: 'rss', category: 'ai_companies' },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', source_type: 'rss', category: 'ai_companies' },
  // AI & tech news
  { name: 'The Rundown AI', url: 'https://www.therundown.ai/feed', source_type: 'rss', category: 'ai_news' },
  { name: 'The Verge - AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', source_type: 'rss', category: 'ai_news' },
  { name: 'TechCrunch - AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source_type: 'rss', category: 'ai_news' },
  { name: 'Ars Technica - AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source_type: 'rss', category: 'ai_news' },
  // Strategy
  { name: 'Benedict Evans', url: 'https://www.ben-evans.com/benedictevans?format=rss', source_type: 'rss', category: 'strategy' },
  { name: 'Stratechery', url: 'https://stratechery.com/feed/', source_type: 'rss', category: 'strategy' },
  // Commerce
  { name: 'Practical Ecommerce', url: 'https://www.practicalecommerce.com/feed', source_type: 'rss', category: 'commerce' },
  { name: 'Shopify Engineering', url: 'https://shopify.engineering/blog/feed.atom', source_type: 'rss', category: 'commerce' },
];

const searchQueries = [
  // Agentic commerce
  { query: 'Shopify agentic commerce OR agentic storefronts OR AI shopping', category: 'agentic_commerce', added_by: 'system' },
  { query: 'commercetools agentic commerce OR AgenticLift', category: 'agentic_commerce', added_by: 'system' },
  { query: 'agentic commerce protocol ACP OR "AI shopping" OR "AI checkout"', category: 'agentic_commerce', added_by: 'system' },
  { query: 'ChatGPT shopping OR Perplexity shopping OR "AI product discovery"', category: 'agentic_commerce', added_by: 'system' },
  { query: 'AI agents replacing Google Search for product discovery', category: 'agentic_commerce', added_by: 'system' },
  // Platform shifts
  { query: 'Google "AI Mode" search OR "Universal Commerce Protocol" OR "AI Overviews" ads', category: 'platform_shifts', added_by: 'system' },
  // Search disruption
  { query: 'AI search optimization OR "generative engine optimization" OR "zero-click" AI', category: 'search_marketing', added_by: 'system' },
  { query: 'Google AI Overviews impact on organic search traffic SEO', category: 'search_disruption', added_by: 'system' },
  { query: 'AI-mediated discovery replacing traditional search engines', category: 'search_disruption', added_by: 'system' },
  // Agency disruption
  { query: 'AI disruption digital marketing agencies SEO paid media', category: 'agency_disruption', added_by: 'system' },
  { query: 'AI agents customer acquisition marketing automation', category: 'agency_disruption', added_by: 'system' },
  // Opportunities
  { query: 'brands optimizing for AI agent recommendations', category: 'opportunities', added_by: 'system' },
  { query: 'digital PR and AI content strategy trends', category: 'opportunities', added_by: 'system' },
];

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

async function ensureSeedData() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logger.warn('Skipping seed check: Supabase credentials not configured');
    return;
  }

  try {
    // Check current row counts
    const { count: sourceCount, error: sourceErr } = await supabase
      .from('briefing_sources')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    const { count: queryCount, error: queryErr } = await supabase
      .from('briefing_search_queries')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    // If we can't even read the tables, the schema probably doesn't exist yet
    if (sourceErr || queryErr) {
      logger.warn('Seed check: could not read tables (schema may not exist yet)', {
        sourceErr: sourceErr?.message,
        queryErr: queryErr?.message,
      });
      return;
    }

    logger.info(`Seed check: ${sourceCount} active sources, ${queryCount} active queries`);

    // Seed sources if empty
    if (sourceCount === 0) {
      logger.info(`Seeding ${rssSources.length} RSS sources...`);
      const { data, error } = await supabase
        .from('briefing_sources')
        .upsert(rssSources, { onConflict: 'url', ignoreDuplicates: true })
        .select();

      if (error) {
        logger.error('Failed to seed sources', { error: error.message });
      } else {
        logger.info(`Seeded ${data?.length || 0} sources`);
      }
    }

    // Seed search queries if empty
    if (queryCount === 0) {
      logger.info(`Seeding ${searchQueries.length} search queries...`);
      const { data, error } = await supabase
        .from('briefing_search_queries')
        .upsert(searchQueries, { onConflict: 'query', ignoreDuplicates: true })
        .select();

      if (error) {
        logger.error('Failed to seed queries', { error: error.message });
      } else {
        logger.info(`Seeded ${data?.length || 0} queries`);
      }
    }
  } catch (err) {
    logger.error('Seed verification failed', { error: err.message });
  }
}

module.exports = { ensureSeedData };
