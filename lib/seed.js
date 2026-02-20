/**
 * Startup seed verification.
 *
 * Uses the Supabase JS client to ensure briefing_sources has seed data.
 * Safe to run on every startup — uses upsert with ignoreDuplicates.
 *
 * Search queries are NOT seeded here — they are managed entirely via
 * the API / Supabase dashboard so the user has full control.
 */

const supabase = require('./supabase');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Seed data — combines migration 002 + scripts/seed.js sources
// ---------------------------------------------------------------------------

const rssSources = [
  // AI & Tech News
  { name: 'The Rundown AI', url: 'https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml', source_type: 'rss', category: 'ai_news' },
  { name: 'The Verge - AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', source_type: 'rss', category: 'ai_news' },
  { name: 'TechCrunch - AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', source_type: 'rss', category: 'ai_news' },
  { name: 'Ars Technica - AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', source_type: 'rss', category: 'ai_news' },
  // Search & Marketing
  { name: 'Search Engine Land', url: 'https://searchengineland.com/feed', source_type: 'rss', category: 'search_marketing' },
  { name: 'Search Engine Journal', url: 'https://www.searchenginejournal.com/feed/', source_type: 'rss', category: 'search_marketing' },
  { name: 'Marketing AI Institute', url: 'https://www.marketingaiinstitute.com/blog/rss.xml', source_type: 'rss', category: 'ai_marketing' },
  // AI Company Blogs
  { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml', source_type: 'rss', category: 'ai_companies' },
  { name: 'Google Blog', url: 'https://blog.google/rss/', source_type: 'rss', category: 'ai_companies' },
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', source_type: 'rss', category: 'ai_companies' },
  // Strategy
  { name: 'Benedict Evans', url: 'https://www.ben-evans.com/benedictevans?format=rss', source_type: 'rss', category: 'strategy' },
  { name: 'Stratechery', url: 'https://stratechery.com/feed/', source_type: 'rss', category: 'strategy' },
  // eCommerce & Commerce
  { name: 'Shopify Blog', url: 'https://www.shopify.com/blog.atom', source_type: 'rss', category: 'commerce' },
  { name: 'Practical Ecommerce', url: 'https://www.practicalecommerce.com/feed', source_type: 'rss', category: 'commerce' },
  { name: 'Shopify Engineering', url: 'https://shopify.engineering/blog.atom', source_type: 'rss', category: 'commerce' },
  { name: 'RetailDive', url: 'https://www.retaildive.com/feeds/news/', source_type: 'rss', category: 'commerce' },
];

// Web scrape sources — blogs/resource pages without reliable RSS feeds
const webScrapeSources = [
  {
    name: 'Retailgentic Blog',
    url: 'https://www.retailgentic.com',
    source_type: 'web_scrape',
    category: 'agentic_commerce',
    config: {
      articleSelector: 'a[href*="/p/"]',
      titleSelector: 'h1',
      contentSelector: '.body, .post-content, article',
      maxArticles: 5,
    },
  },
  {
    name: 'OpenAI Commerce Docs',
    url: 'https://developers.openai.com/commerce/',
    source_type: 'web_scrape',
    category: 'agentic_commerce',
    config: {
      articleSelector: 'a[href*="/commerce/"]',
      titleSelector: 'h1',
      contentSelector: 'main, article, .content',
      maxArticles: 5,
    },
  },
  {
    name: 'Shopify UK Blog',
    url: 'https://www.shopify.com/uk/blog',
    source_type: 'web_scrape',
    category: 'commerce',
    config: {
      articleSelector: 'a[href*="/uk/blog/"]',
      titleSelector: 'h1',
      contentSelector: 'article, .article__body, .rte',
      maxArticles: 5,
      baseDomain: 'https://www.shopify.com',
    },
  },
  {
    name: 'commercetools Resources',
    url: 'https://commercetools.com/resources',
    source_type: 'web_scrape',
    category: 'commerce',
    config: {
      articleSelector: 'a[href*="/resources/"]',
      titleSelector: 'h1',
      contentSelector: 'main, article, .content-body',
      maxArticles: 5,
      baseDomain: 'https://commercetools.com',
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Insert rows one-by-one, skipping any that already exist.
 * Used as a fallback when upsert fails (e.g. missing UNIQUE constraint).
 */
async function insertRowByRow(table, rows, label) {
  let inserted = 0;
  for (const row of rows) {
    const { error } = await supabase.from(table).insert(row);
    if (error) {
      // 23505 = unique_violation — row already exists, skip it
      if (error.code === '23505') continue;
      logger.warn(`${label}: failed to insert row`, { error: error.message, row });
    } else {
      inserted++;
    }
  }
  return inserted;
}

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

    // If we can't even read the tables, the schema probably doesn't exist yet
    if (sourceErr) {
      logger.warn('Seed check: could not read tables (schema may not exist yet)', {
        sourceErr: sourceErr?.message,
      });
      return;
    }

    logger.info(`Seed check: ${sourceCount} active sources`);

    // --- Seed sources ---
    const allSources = [...rssSources, ...webScrapeSources];
    logger.info(`Upserting ${allSources.length} sources (${rssSources.length} RSS + ${webScrapeSources.length} web scrape)...`);
    const { data: srcData, error: srcUpsertErr } = await supabase
      .from('briefing_sources')
      .upsert(allSources, { onConflict: 'url', ignoreDuplicates: true })
      .select();

    if (srcUpsertErr) {
      logger.warn('Upsert failed for sources, falling back to row-by-row insert', {
        error: srcUpsertErr.message,
      });
      const count = await insertRowByRow('briefing_sources', allSources, 'sources');
      logger.info(`Inserted ${count} sources via fallback`);
    } else {
      logger.info(`Upserted ${srcData?.length || 0} sources`);
    }

    // Search queries are managed entirely via the database (API or Supabase dashboard).
    // No hardcoded queries are seeded here — the agent uses only what's in the DB.
  } catch (err) {
    logger.error('Seed verification failed', { error: err.message });
  }
}

module.exports = { ensureSeedData };
