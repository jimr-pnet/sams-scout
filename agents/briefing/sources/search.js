const { tavily } = require('@tavily/core');
const supabase = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

// Lazy-init: Tavily SDK throws at construction time if no key is present
let client;
function getClient() {
  if (!client) client = tavily({ apiKey: process.env.TAVILY_API_KEY });
  return client;
}

/**
 * Run web search for all active standing queries using Tavily.
 *
 * @param {object} [options]
 * @param {number} [options.maxResultsPerQuery=5] - Max items per query
 * @param {number} [options.maxResultsPerQuery=5] - Max items per query
 * @returns {Promise<Array>} Normalized raw items ready for insertion
 */
async function fetchSearchResults(options = {}) {
  const { maxResultsPerQuery = 5 } = options;

  if (!process.env.TAVILY_API_KEY) {
    logger.warn('Skipping web search: TAVILY_API_KEY not configured');
    return [];
  }

  // Get ALL active search queries from the database
  const { data: queries, error } = await supabase
    .from('briefing_search_queries')
    .select('*')
    .eq('active', true);

  if (error) {
    logger.error('Failed to fetch search queries', { error: error.message });
    return [];
  }

  if (!queries || queries.length === 0) {
    logger.info('No active search queries configured');
    return [];
  }

  const activeQueries = queries;

  logger.info(`Running ${activeQueries.length} Tavily searches${limit ? ` (limited from ${queries.length})` : ''}`);

  // Run searches sequentially to stay within rate limits
  const items = [];
  for (const query of activeQueries) {
    try {
      const results = await searchSingleQuery(query, maxResultsPerQuery);
      items.push(...results);
    } catch (err) {
      logger.error(`Tavily search failed for query: "${query.query}"`, {
        error: err.message,
      });
    }
  }

  logger.info(`Web search complete: ${items.length} items from ${activeQueries.length} queries`);
  return items;
}

async function searchSingleQuery(query, maxResults) {
  const response = await getClient().search(query.query, {
    searchDepth: 'basic',
    topic: 'news',
    maxResults,
    days: 3,
  });

  return (response.results || []).map(r => ({
    source_id: null,
    source_type: 'web_search',
    title: r.title || 'Untitled',
    url: r.url || '',
    content: r.content || '',
    content_snippet: (r.content || '').substring(0, 500),
    published_at: r.publishedDate || null,
    metadata: {
      query_id: query.id,
      query_text: query.query,
      category: query.category,
      tavily_score: r.score,
    },
  }));
}

module.exports = { fetchSearchResults };
