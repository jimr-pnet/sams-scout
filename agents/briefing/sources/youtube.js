const supabase = require('../../../lib/supabase');
const logger = require('../../../lib/logger');

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Fetch recent YouTube videos and their transcripts from configured channels.
 * Uses YouTube Data API v3 for video listing and the timedtext endpoint for transcripts.
 *
 * Each source's `config` JSONB can contain:
 *   - channelId: YouTube channel ID (required if URL is a channel URL)
 *   - playlistId: uploads playlist ID (auto-derived from channelId if not set)
 *   - maxVideos: max videos to fetch (default 3)
 *
 * @param {object} [options]
 * @param {number} [options.maxVideosPerChannel=3] - Default max videos per channel
 * @param {number} [options.hoursBack=48] - How many hours back to look for videos
 * @returns {Promise<Array>} Normalized raw items ready for insertion
 */
async function fetchYouTubeTranscripts(options = {}) {
  const maxVideos = options.maxVideosPerChannel || 3;
  const hoursBack = options.hoursBack || 48;

  if (!YOUTUBE_API_KEY) {
    logger.warn('YOUTUBE_API_KEY not configured, skipping YouTube collection');
    return [];
  }

  const { data: sources, error } = await supabase
    .from('briefing_sources')
    .select('*')
    .eq('source_type', 'youtube_channel')
    .eq('active', true);

  if (error) {
    logger.error('Failed to fetch YouTube sources', { error: error.message });
    return [];
  }

  if (!sources || sources.length === 0) {
    logger.info('No active YouTube channel sources configured');
    return [];
  }

  logger.info(`Fetching videos from ${sources.length} YouTube channels`);

  const results = await Promise.allSettled(
    sources.map(source => fetchChannelVideos(source, maxVideos, hoursBack))
  );

  const items = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      items.push(...results[i].value);
    } else {
      logger.error(`YouTube channel failed: ${sources[i].name}`, {
        error: results[i].reason.message,
      });
    }
  }

  logger.info(`YouTube collection complete: ${items.length} videos`);
  return items;
}

async function fetchChannelVideos(source, maxVideos, hoursBack) {
  const config = source.config || {};
  let channelId = config.channelId;

  // Extract channel ID from URL if not in config
  if (!channelId && source.url) {
    channelId = extractChannelId(source.url);
  }

  if (!channelId) {
    logger.warn(`No channel ID for YouTube source: ${source.name}`);
    return [];
  }

  // Get the uploads playlist ID (replace 'UC' prefix with 'UU')
  const uploadsPlaylistId = config.playlistId || channelId.replace(/^UC/, 'UU');

  // Fetch recent videos from the uploads playlist
  const publishedAfter = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const searchUrl = `${YOUTUBE_API_BASE}/search?` + new URLSearchParams({
    key: YOUTUBE_API_KEY,
    channelId,
    part: 'snippet',
    order: 'date',
    maxResults: String(maxVideos),
    publishedAfter,
    type: 'video',
  });

  const searchResponse = await fetch(searchUrl, {
    signal: AbortSignal.timeout(15000),
  });

  if (!searchResponse.ok) {
    throw new Error(`YouTube API returned ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();
  const videos = searchData.items || [];

  if (videos.length === 0) {
    logger.debug(`No recent videos for channel: ${source.name}`);
    return [];
  }

  // Fetch transcripts for each video
  const items = [];
  for (const video of videos) {
    const videoId = video.id?.videoId;
    if (!videoId) continue;

    try {
      const transcript = await fetchTranscript(videoId);
      const snippet = video.snippet || {};

      items.push({
        source_id: source.id,
        source_type: 'youtube_transcript',
        title: snippet.title || 'Untitled Video',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        content: transcript || snippet.description || '',
        content_snippet: (transcript || snippet.description || '').substring(0, 500),
        published_at: snippet.publishedAt || null,
        metadata: {
          video_id: videoId,
          channel_title: snippet.channelTitle,
          channel_id: channelId,
          has_transcript: !!transcript,
          thumbnail: snippet.thumbnails?.medium?.url,
        },
      });
    } catch (err) {
      logger.warn(`Failed to fetch transcript for video ${videoId}`, {
        error: err.message,
      });
    }
  }

  return items;
}

/**
 * Fetch a video transcript via YouTube's timedtext endpoint.
 * Falls back gracefully if no captions are available.
 */
async function fetchTranscript(videoId) {
  try {
    // Fetch the video page to extract caption track URL
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PropellerNet-Briefing/1.0)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!pageResponse.ok) return null;

    const html = await pageResponse.text();

    // Extract captions URL from the page data
    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) return null;

    let captionTracks;
    try {
      captionTracks = JSON.parse(captionMatch[1]);
    } catch {
      return null;
    }

    // Prefer English captions
    const track = captionTracks.find(t => t.languageCode === 'en')
      || captionTracks.find(t => t.languageCode?.startsWith('en'))
      || captionTracks[0];

    if (!track?.baseUrl) return null;

    // Fetch the caption track
    const captionResponse = await fetch(track.baseUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!captionResponse.ok) return null;

    const captionXml = await captionResponse.text();

    // Parse the XML transcript — extract text from <text> elements
    const textParts = [];
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let match;
    while ((match = textRegex.exec(captionXml)) !== null) {
      const decoded = match[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, ' ')
        .trim();
      if (decoded) textParts.push(decoded);
    }

    return textParts.length > 0 ? textParts.join(' ') : null;
  } catch (err) {
    logger.debug(`Transcript fetch failed for ${videoId}: ${err.message}`);
    return null;
  }
}

function extractChannelId(url) {
  // Handle youtube.com/channel/UCxxxxx format
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (channelMatch) return channelMatch[1];

  // Handle youtube.com/@handle format — would need an API call to resolve
  // For now, config.channelId should be set directly for handle-based URLs
  return null;
}

module.exports = { fetchYouTubeTranscripts };
