const RSSParser = require('rss-parser');
const supabase = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'PropellerNet-Briefing/1.0',
  },
});

/**
 * Fetch RSS feeds from all active RSS sources.
 * Filters items to the last 24 hours by default.
 *
 * @param {object} [options]
 * @param {number} [options.hoursBack=24] - How many hours back to look for items
 * @returns {Promise<Array>} Normalized raw items ready for insertion
 */
async function fetchRSS(options = {}) {
  const hoursBack = options.hoursBack || 24;
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  // Get active RSS sources
  const { data: sources, error } = await supabase
    .from('briefing_sources')
    .select('*')
    .eq('source_type', 'rss')
    .eq('active', true);

  if (error) {
    logger.error('Failed to fetch RSS sources', { error: error.message });
    return [];
  }

  if (!sources || sources.length === 0) {
    logger.info('No active RSS sources configured');
    return [];
  }

  logger.info(`Fetching ${sources.length} RSS feeds`);

  // Fetch all feeds in parallel
  const results = await Promise.allSettled(
    sources.map(source => fetchSingleFeed(source, cutoff))
  );

  const items = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      items.push(...result.value);
    } else {
      logger.error(`RSS feed failed: ${sources[i].name}`, {
        error: result.reason.message,
        url: sources[i].url,
      });
    }
  }

  logger.info(`RSS collection complete: ${items.length} items from ${sources.length} feeds`);
  return items;
}

async function fetchSingleFeed(source, cutoff) {
  const feed = await parser.parseURL(source.url);
  const items = [];

  for (const entry of feed.items || []) {
    const publishedAt = entry.pubDate ? new Date(entry.pubDate) : null;

    // Skip items older than cutoff
    if (publishedAt && publishedAt < cutoff) continue;

    const content = entry['content:encoded'] || entry.content || entry.summary || '';
    const snippet = (entry.contentSnippet || content)
      .replace(/<[^>]*>/g, '')
      .substring(0, 500);

    items.push({
      source_id: source.id,
      source_type: 'rss',
      title: entry.title || 'Untitled',
      url: entry.link || '',
      content: content,
      content_snippet: snippet,
      published_at: publishedAt ? publishedAt.toISOString() : null,
      metadata: {
        feed_title: feed.title,
        author: entry.creator || entry.author || null,
        categories: entry.categories || [],
      },
    });
  }

  logger.debug(`Feed "${source.name}": ${items.length} recent items`);
  return items;
}

module.exports = { fetchRSS };
