const { webSearch } = require('../../../lib/ai');
const supabase = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

/**
 * Run web search for all active standing queries.
 * Uses Claude web_search tool or OpenAI Responses API web_search_preview
 * depending on the selected provider.
 *
 * @param {object} [options]
 * @param {string} [options.provider] - AI provider ('claude' or 'openai')
 * @param {number} [options.maxResultsPerQuery=5] - Max items to extract per query
 * @param {number} [options.limit] - Max number of queries to run (for lite/test mode)
 * @returns {Promise<Array>} Normalized raw items ready for insertion
 */
async function fetchSearchResults(options = {}) {
  const { provider, maxResultsPerQuery = 5, limit } = options;

  // Get active search queries
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

  // In lite mode, pick a random subset of queries
  const activeQueries = limit && limit < queries.length
    ? queries.sort(() => Math.random() - 0.5).slice(0, limit)
    : queries;

  logger.info(`Running ${activeQueries.length} web searches${limit ? ` (limited from ${queries.length})` : ''}`, { provider: provider || 'default' });

  // Run searches sequentially to manage API usage
  const items = [];
  for (const query of activeQueries) {
    try {
      const results = await searchSingleQuery(query, maxResultsPerQuery, provider);
      items.push(...results);
    } catch (err) {
      logger.error(`Web search failed for query: "${query.query}"`, {
        error: err.message,
      });
    }
  }

  logger.info(`Web search complete: ${items.length} items from ${activeQueries.length} queries`);
  return items;
}

async function searchSingleQuery(query, maxResults, provider) {
  const { text } = await webSearch({
    provider,
    userMessage: `Search the web for the latest news and developments about: "${query.query}"

Find the most recent and relevant articles, blog posts, or reports from the past 24 hours. For each result, extract:
- The article title
- The URL
- A 2-3 sentence summary of the key points

Return your findings as a JSON array with this structure:
[{"title": "...", "url": "...", "summary": "..."}]

Return ONLY the JSON array, no other text. If you find fewer than ${maxResults} relevant results, that's fine. Focus on quality and recency.`,
    maxTokens: 4096,
  });

  // Parse the JSON array from the response
  let results;
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn(`No JSON array found in search response for: "${query.query}"`);
      return [];
    }
    results = JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error(`Failed to parse search results for: "${query.query}"`, {
      error: err.message,
    });
    return [];
  }

  return results.slice(0, maxResults).map(r => ({
    source_id: null,
    source_type: 'web_search',
    title: r.title || 'Untitled',
    url: r.url || '',
    content: r.summary || '',
    content_snippet: (r.summary || '').substring(0, 500),
    published_at: null,
    metadata: {
      query_id: query.id,
      query_text: query.query,
      category: query.category,
    },
  }));
}

module.exports = { fetchSearchResults };
