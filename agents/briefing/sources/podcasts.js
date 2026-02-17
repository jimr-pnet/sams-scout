const cheerio = require('cheerio');
const supabase = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

/**
 * Scrape podcast transcripts from configured podcast sources.
 * Each source's `config` JSONB should contain scraping selectors:
 *   - transcriptListUrl: URL of the page listing recent episodes
 *   - episodeSelector: CSS selector for episode links
 *   - transcriptSelector: CSS selector for transcript text on episode page
 *   - titleSelector: CSS selector for episode title
 *   - dateSelector: CSS selector for publish date (optional)
 *
 * @param {object} [options]
 * @param {number} [options.maxEpisodesPerSource=3] - Max episodes to fetch per source
 * @returns {Promise<Array>} Normalized raw items ready for insertion
 */
async function fetchPodcastTranscripts(options = {}) {
  const maxEpisodes = options.maxEpisodesPerSource || 3;

  const { data: sources, error } = await supabase
    .from('briefing_sources')
    .select('*')
    .eq('source_type', 'podcast_transcript')
    .eq('active', true);

  if (error) {
    logger.error('Failed to fetch podcast sources', { error: error.message });
    return [];
  }

  if (!sources || sources.length === 0) {
    logger.info('No active podcast transcript sources configured');
    return [];
  }

  logger.info(`Scraping transcripts from ${sources.length} podcast sources`);

  const results = await Promise.allSettled(
    sources.map(source => scrapePodcast(source, maxEpisodes))
  );

  const items = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      items.push(...results[i].value);
    } else {
      logger.error(`Podcast scrape failed: ${sources[i].name}`, {
        error: results[i].reason.message,
      });
    }
  }

  logger.info(`Podcast collection complete: ${items.length} transcripts`);
  return items;
}

async function scrapePodcast(source, maxEpisodes) {
  const config = source.config || {};
  const {
    transcriptListUrl,
    episodeSelector = 'a',
    transcriptSelector = '.transcript, .post-content, article',
    titleSelector = 'h1',
  } = config;

  const listUrl = transcriptListUrl || source.url;

  // Fetch the episode listing page
  const listResponse = await fetch(listUrl, {
    headers: { 'User-Agent': 'PropellerNet-Briefing/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!listResponse.ok) {
    throw new Error(`HTTP ${listResponse.status} fetching ${listUrl}`);
  }

  const listHtml = await listResponse.text();
  const $list = cheerio.load(listHtml);

  // Extract episode URLs
  const episodeUrls = [];
  $list(episodeSelector).each((_i, el) => {
    const href = $list(el).attr('href');
    if (href && episodeUrls.length < maxEpisodes) {
      // Resolve relative URLs
      const fullUrl = href.startsWith('http') ? href : new URL(href, listUrl).href;
      episodeUrls.push(fullUrl);
    }
  });

  if (episodeUrls.length === 0) {
    logger.warn(`No episode links found for podcast: ${source.name}`);
    return [];
  }

  // Fetch each episode transcript
  const items = [];
  for (const episodeUrl of episodeUrls) {
    try {
      const item = await scrapeEpisodePage(episodeUrl, source, {
        transcriptSelector,
        titleSelector,
      });
      if (item) items.push(item);
    } catch (err) {
      logger.warn(`Failed to scrape episode: ${episodeUrl}`, { error: err.message });
    }
  }

  return items;
}

async function scrapeEpisodePage(url, source, selectors) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'PropellerNet-Briefing/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) return null;

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = $(selectors.titleSelector).first().text().trim() || 'Untitled Episode';
  const transcript = $(selectors.transcriptSelector).first().text().trim();

  if (!transcript || transcript.length < 100) {
    logger.debug(`Skipping episode with short/missing transcript: ${url}`);
    return null;
  }

  return {
    source_id: source.id,
    source_type: 'podcast_transcript',
    title,
    url,
    content: transcript,
    content_snippet: transcript.substring(0, 500),
    published_at: null,
    metadata: {
      podcast_name: source.name,
      content_length: transcript.length,
    },
  };
}

module.exports = { fetchPodcastTranscripts };
