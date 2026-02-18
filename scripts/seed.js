/**
 * Seed script: populate briefing_sources and briefing_search_queries
 * with initial data relevant to PropellerNet's focus on agentic commerce
 * and marketing disruption.
 *
 * Usage: node scripts/seed.js
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ---------------------------------------------------------------------------
// RSS Sources
// ---------------------------------------------------------------------------
const rssSources = [
  // AI & Tech News
  {
    name: 'The Rundown AI',
    url: 'https://rss.beehiiv.com/feeds/2R3C6Bt5wj.xml',
    source_type: 'rss',
    category: 'ai_news',
  },
  {
    name: 'The Verge - AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    source_type: 'rss',
    category: 'ai_news',
  },
  {
    name: 'TechCrunch - AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    source_type: 'rss',
    category: 'ai_news',
  },
  {
    name: 'Ars Technica - AI',
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    source_type: 'rss',
    category: 'ai_news',
  },
  // Search & Marketing Industry
  {
    name: 'Search Engine Land',
    url: 'https://searchengineland.com/feed',
    source_type: 'rss',
    category: 'search_marketing',
  },
  {
    name: 'Search Engine Journal',
    url: 'https://www.searchenginejournal.com/feed/',
    source_type: 'rss',
    category: 'search_marketing',
  },
  {
    name: 'Marketing AI Institute',
    url: 'https://www.marketingaiinstitute.com/blog/rss.xml',
    source_type: 'rss',
    category: 'ai_marketing',
  },
  // AI Company Blogs
  {
    name: 'OpenAI Blog',
    url: 'https://openai.com/news/rss.xml',
    source_type: 'rss',
    category: 'ai_companies',
  },
  {
    name: 'Google Blog',
    url: 'https://blog.google/rss/',
    source_type: 'rss',
    category: 'ai_companies',
  },
  {
    name: 'Google AI Blog',
    url: 'https://blog.google/technology/ai/rss/',
    source_type: 'rss',
    category: 'ai_companies',
  },
  // Strategy & Analysis
  {
    name: 'Benedict Evans',
    url: 'https://www.ben-evans.com/benedictevans?format=rss',
    source_type: 'rss',
    category: 'strategy',
  },
  {
    name: 'Stratechery',
    url: 'https://stratechery.com/feed/',
    source_type: 'rss',
    category: 'strategy',
  },
  // eCommerce & Commerce
  {
    name: 'Shopify Blog',
    url: 'https://www.shopify.com/blog.atom',
    source_type: 'rss',
    category: 'commerce',
  },
  {
    name: 'Practical Ecommerce',
    url: 'https://www.practicalecommerce.com/feed',
    source_type: 'rss',
    category: 'commerce',
  },
  {
    name: 'Shopify Engineering',
    url: 'https://shopify.engineering/blog.atom',
    source_type: 'rss',
    category: 'commerce',
  },
  {
    name: 'RetailDive',
    url: 'https://www.retaildive.com/feeds/news/',
    source_type: 'rss',
    category: 'commerce',
  },
];

// ---------------------------------------------------------------------------
// YouTube Channels
// ---------------------------------------------------------------------------
const youtubeSources = [
  {
    name: 'AI Explained',
    url: 'https://www.youtube.com/channel/UCNJ1Ymd5yFuUPtn21xtRbbw',
    source_type: 'youtube_channel',
    category: 'ai_analysis',
    config: { channelId: 'UCNJ1Ymd5yFuUPtn21xtRbbw' },
  },
  {
    name: 'Matt Wolfe - AI News',
    url: 'https://www.youtube.com/channel/UCddiUEpeqJcYeBxX1IVBKvQ',
    source_type: 'youtube_channel',
    category: 'ai_news',
    config: { channelId: 'UCddiUEpeqJcYeBxX1IVBKvQ' },
  },
];

// ---------------------------------------------------------------------------
// Standing Search Queries
// ---------------------------------------------------------------------------
const searchQueries = [
  // Core agentic commerce topics
  {
    query: 'agentic commerce AI shopping agents latest news',
    category: 'agentic_commerce',
    added_by: 'system',
  },
  {
    query: 'AI agents replacing Google Search for product discovery',
    category: 'agentic_commerce',
    added_by: 'system',
  },
  {
    query: 'ChatGPT shopping features ecommerce integration',
    category: 'agentic_commerce',
    added_by: 'system',
  },
  {
    query: 'Perplexity AI commerce shopping product recommendations',
    category: 'agentic_commerce',
    added_by: 'system',
  },
  // SEO & search disruption
  {
    query: 'Google AI Overviews impact on organic search traffic SEO',
    category: 'search_disruption',
    added_by: 'system',
  },
  {
    query: 'AI-mediated discovery replacing traditional search engines',
    category: 'search_disruption',
    added_by: 'system',
  },
  {
    query: 'zero-click searches AI answers SEO implications',
    category: 'search_disruption',
    added_by: 'system',
  },
  // Marketing agency disruption
  {
    query: 'AI disruption digital marketing agencies SEO paid media',
    category: 'agency_disruption',
    added_by: 'system',
  },
  {
    query: 'AI agents customer acquisition marketing automation',
    category: 'agency_disruption',
    added_by: 'system',
  },
  // OpenAI Commerce (no RSS — docs site)
  {
    query: 'OpenAI agentic commerce protocol shopping ChatGPT product feeds',
    category: 'agentic_commerce',
    added_by: 'system',
  },
  {
    query: 'OpenAI commerce API checkout integration merchant onboarding',
    category: 'agentic_commerce',
    added_by: 'system',
  },
  // commercetools (no RSS for resources page)
  {
    query: 'commercetools composable commerce AI agents MACH architecture',
    category: 'commerce',
    added_by: 'system',
  },
  // Opportunity spotting
  {
    query: 'brands optimizing for AI agent recommendations',
    category: 'opportunities',
    added_by: 'system',
  },
  {
    query: 'digital PR and AI content strategy trends',
    category: 'opportunities',
    added_by: 'system',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Insert rows one-by-one, skipping duplicates.
 * Fallback when upsert fails (e.g. missing UNIQUE constraint).
 */
async function insertRowByRow(table, rows) {
  let inserted = 0;
  for (const row of rows) {
    const { error } = await supabase.from(table).insert(row);
    if (error) {
      if (error.code === '23505') continue; // unique_violation — already exists
      console.error(`  Failed to insert into ${table}:`, error.message);
    } else {
      inserted++;
    }
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Seed execution
// ---------------------------------------------------------------------------
async function seed() {
  console.log('Seeding briefing_sources...');

  const allSources = [...rssSources, ...youtubeSources];
  const { data: sourceData, error: sourceError } = await supabase
    .from('briefing_sources')
    .upsert(allSources, { onConflict: 'url', ignoreDuplicates: true })
    .select();

  if (sourceError) {
    console.warn('  Upsert failed, falling back to row-by-row insert:', sourceError.message);
    const count = await insertRowByRow('briefing_sources', allSources);
    console.log(`  Inserted ${count} sources via fallback`);
  } else {
    console.log(`  Upserted ${sourceData?.length || 0} sources`);
  }

  console.log('Seeding briefing_search_queries...');

  const { data: queryData, error: queryError } = await supabase
    .from('briefing_search_queries')
    .upsert(searchQueries, { onConflict: 'query', ignoreDuplicates: true })
    .select();

  if (queryError) {
    console.warn('  Upsert failed, falling back to row-by-row insert:', queryError.message);
    const count = await insertRowByRow('briefing_search_queries', searchQueries);
    console.log(`  Inserted ${count} queries via fallback`);
  } else {
    console.log(`  Upserted ${queryData?.length || 0} queries`);
  }

  // Verify
  const { count: sourceCount } = await supabase
    .from('briefing_sources')
    .select('*', { count: 'exact', head: true });
  const { count: queryCount } = await supabase
    .from('briefing_search_queries')
    .select('*', { count: 'exact', head: true });

  console.log(`\nDone! Database now has ${sourceCount} sources and ${queryCount} queries.`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
