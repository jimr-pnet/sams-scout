const cheerio = require('cheerio');
const supabase = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

/**
 * Scrape blog/resource pages from configured web_scrape sources.
 * Each source's `config` JSONB should contain:
 *   - articleSelector: CSS selector for article links on the listing page
 *   - titleSelector: CSS selector for title on article page (default: 'h1')
 *   - contentSelector: CSS selector for content on article page
 *   - dateSelector: CSS selector for date on article page (optional)
 *   - maxArticles: max articles per source (default: 5)
 *
 * @param {object} [options]
 * @returns {Promise<Array>} Normalized raw items ready for insertion
 */
async function fetchWebScrapeItems(options = {}) {
  const { data: sources, error } = await supabase
    .from('briefing_sources')
    .select('*')
    .eq('source_type', 'web_scrape')
    .eq('active', true);

  if (error) {
    logger.error('Failed to fetch web_scrape sources', { error: error.message });
    return [];
  }

  if (!sources || sources.length === 0) {
    logger.info('No active web_scrape sources configured');
    return [];
  }

  logger.info(`Scraping ${sources.length} web sources`);

  const results = await Promise.allSettled(
    sources.map(source => scrapeListing(source))
  );

  const items = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      items.push(...results[i].value);
    } else {
      logger.error(`Web scrape failed: ${sources[i].name}`, {
        error: results[i].reason.message,
        url: sources[i].url,
      });
    }
  }

  logger.info(`Web scrape collection complete: ${items.length} articles`);
  return items;
}

async function scrapeListing(source) {
  const config = source.config || {};
  const {
    articleSelector = 'a',
    titleSelector = 'h1',
    contentSelector = 'article, .post-content, .blog-content, .entry-content, main',
    dateSelector = 'time, .date, .published',
    maxArticles = 5,
  } = config;

  const listUrl = config.listUrl || source.url;

  // Fetch the listing page
  const listResponse = await fetch(listUrl, {
    headers: { 'User-Agent': 'PropellerNet-Briefing/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!listResponse.ok) {
    throw new Error(`HTTP ${listResponse.status} fetching ${listUrl}`);
  }

  const listHtml = await listResponse.text();
  const $list = cheerio.load(listHtml);

  // Extract and deduplicate article URLs
  const seen = new Set();
  const articleUrls = [];
  $list(articleSelector).each((_i, el) => {
    if (articleUrls.length >= maxArticles) return false;

    const href = $list(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    const fullUrl = href.startsWith('http')
      ? href
      : new URL(href, listUrl).href;

    if (!seen.has(fullUrl)) {
      seen.add(fullUrl);
      articleUrls.push(fullUrl);
    }
  });

  if (articleUrls.length === 0) {
    logger.warn(`No article links found for web_scrape source: ${source.name}`);
    return [];
  }

  logger.debug(`Source "${source.name}": found ${articleUrls.length} article URLs`);

  // Fetch each article page
  const items = [];
  for (const articleUrl of articleUrls) {
    try {
      const item = await scrapeArticlePage(articleUrl, source, {
        titleSelector,
        contentSelector,
        dateSelector,
      });
      if (item) items.push(item);
    } catch (err) {
      logger.warn(`Failed to scrape article: ${articleUrl}`, { error: err.message });
    }
  }

  logger.debug(`Source "${source.name}": ${items.length} articles scraped`);
  return items;
}

async function scrapeArticlePage(url, source, selectors) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'PropellerNet-Briefing/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) return null;

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $(selectors.titleSelector).first().text().trim() || 'Untitled';
  const content = $(selectors.contentSelector).first().text().trim();

  if (!content || content.length < 100) {
    logger.debug(`Skipping article with short/missing content: ${url}`);
    return null;
  }

  // Try to extract a publish date
  let publishedAt = null;
  const dateEl = $(selectors.dateSelector).first();
  if (dateEl.length) {
    const dateStr = dateEl.attr('datetime') || dateEl.text().trim();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        publishedAt = parsed.toISOString();
      }
    }
  }

  return {
    source_id: source.id,
    source_type: 'web_scrape',
    title,
    url,
    content,
    content_snippet: content.substring(0, 500),
    published_at: publishedAt,
    metadata: {
      source_name: source.name,
      content_length: content.length,
    },
  };
}

module.exports = { fetchWebScrapeItems };
