const express = require('express');
const cron = require('node-cron');
const router = express.Router();
const auth = require('../../middleware/auth');
const logger = require('../../lib/logger');
const supabase = require('../../lib/supabase');
const { getProviders, getDefaultProvider } = require('../../lib/ai');
const { runPipeline } = require('./pipeline');
const { chat } = require('./chat');

// GET /providers — list available AI providers for the frontend toggle
router.get('/providers', (req, res) => {
  res.json({
    providers: getProviders(),
    default: getDefaultProvider(),
  });
});

// GET /episodes — paginated episode list
router.get('/episodes', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { data: episodes, error, count } = await supabase
      .from('briefing_episodes')
      .select('id, date, summary, audio_url, audio_duration_seconds, status, metadata, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      episodes,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /episodes/latest — today's episode (must be before :id route)
router.get('/episodes/latest', async (req, res, next) => {
  try {
    const { data: episode, error } = await supabase
      .from('briefing_episodes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'No episodes found' });
    }
    if (error) throw error;

    // Fetch associated source items
    if (episode.source_item_ids && episode.source_item_ids.length > 0) {
      const { data: sources } = await supabase
        .from('briefing_raw_items')
        .select('id, title, url, source_type, relevance_score, published_at')
        .in('id', episode.source_item_ids);
      episode.sources = sources || [];
    } else {
      episode.sources = [];
    }

    res.json(episode);
  } catch (err) {
    next(err);
  }
});

// GET /episodes/:id — full episode with sections + sources
router.get('/episodes/:id', async (req, res, next) => {
  try {
    const { data: episode, error } = await supabase
      .from('briefing_episodes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Episode not found' });
    }
    if (error) throw error;

    // Fetch associated source items
    if (episode.source_item_ids && episode.source_item_ids.length > 0) {
      const { data: sources } = await supabase
        .from('briefing_raw_items')
        .select('id, title, url, source_type, content_snippet, relevance_score, published_at, metadata')
        .in('id', episode.source_item_ids);
      episode.sources = sources || [];
    } else {
      episode.sources = [];
    }

    res.json(episode);
  } catch (err) {
    next(err);
  }
});

// GET /audio/:id.mp3 — audio file streaming (proxy from Supabase Storage)
router.get('/audio/:id.mp3', async (req, res, next) => {
  try {
    const episodeId = req.params.id;

    const { data: episode, error } = await supabase
      .from('briefing_episodes')
      .select('audio_url, date')
      .eq('id', episodeId)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Episode not found' });
    }
    if (error) throw error;

    if (!episode.audio_url) {
      return res.status(404).json({ error: 'Audio not yet available for this episode' });
    }

    // Redirect to the Supabase Storage public URL
    res.redirect(301, episode.audio_url);
  } catch (err) {
    next(err);
  }
});

// POST /chat — knowledge base chat (semantic search + AI)
router.post('/chat', async (req, res, next) => {
  try {
    const { message, provider } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await chat(message, { provider });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /queries — list standing search queries
router.get('/queries', async (req, res, next) => {
  try {
    const { data: queries, error } = await supabase
      .from('briefing_search_queries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ queries });
  } catch (err) {
    next(err);
  }
});

// POST /queries — add a standing query
router.post('/queries', auth, async (req, res, next) => {
  try {
    const { query, category } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'query is required' });
    }

    const { data, error } = await supabase
      .from('briefing_search_queries')
      .insert({
        query: query.trim(),
        category: category || null,
        active: true,
        added_by: 'sam',
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /queries/:id — remove a standing query
router.delete('/queries/:id', auth, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('briefing_search_queries')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /generate/stream — SSE endpoint for pipeline with real-time status updates
router.get('/generate/stream', auth, (req, res) => {
  const { provider, lite } = req.query;

  // Validate provider if given
  const validProviders = getProviders().map(p => p.id);
  if (provider && !validProviders.includes(provider)) {
    return res.status(400).json({
      error: `Invalid provider: ${provider}. Valid options: ${validProviders.join(', ')}`,
    });
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Pipeline starting...' })}\n\n`);

  // Keep-alive ping every 15s to prevent proxy timeouts
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  // Track client disconnect
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    clearInterval(keepAlive);
  });

  // onStatus callback writes SSE events
  function onStatus(status) {
    if (clientDisconnected) return;
    try {
      res.write(`data: ${JSON.stringify({ type: 'status', ...status })}\n\n`);
    } catch (e) {
      // Client may have disconnected
    }
  }

  // Run pipeline with status callback (lite mode only for now)
  runPipeline({ provider, onStatus, lite: true })
    .then((episode) => {
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ type: 'complete', episode })}\n\n`);
        res.end();
      }
      clearInterval(keepAlive);
    })
    .catch((err) => {
      logger.error('SSE pipeline run failed', { error: err.message });
      if (!clientDisconnected) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
        res.end();
      }
      clearInterval(keepAlive);
    });
});

// POST /generate — manual pipeline trigger with optional provider selection
router.post('/generate', auth, async (req, res, next) => {
  try {
    const { provider, lite } = req.body || {};

    // Validate provider if given
    const validProviders = getProviders().map(p => p.id);
    if (provider && !validProviders.includes(provider)) {
      return res.status(400).json({
        error: `Invalid provider: ${provider}. Valid options: ${validProviders.join(', ')}`,
      });
    }

    // Fire and forget — lite mode only for now
    runPipeline({ provider, lite: true }).catch(err => {
      logger.error('Manual pipeline run failed', { error: err.message });
    });

    res.status(202).json({
      status: 'started',
      provider: provider || getDefaultProvider(),
      lite: true,
      message: 'Lite pipeline triggered (1 web search, no RSS). Results will appear in the database and Slack.',
    });
  } catch (err) {
    next(err);
  }
});

// Schedule cron job for automated daily runs
const cronExpression = process.env.BRIEFING_CRON || '0 5 * * 1-5';

if (cron.validate(cronExpression)) {
  cron.schedule(cronExpression, () => {
    logger.info('Cron triggered: starting briefing pipeline (lite)');
    runPipeline({ lite: true }).catch(err => {
      logger.error('Cron pipeline run failed', { error: err.message });
    });
  }, { timezone: 'Europe/London' });

  logger.info(`Briefing cron scheduled: "${cronExpression}" (Europe/London)`);
} else {
  logger.error(`Invalid cron expression: "${cronExpression}"`);
}

const meta = {
  name: 'briefing',
  description: "Sam's Morning Briefing — daily audio intelligence briefing on agentic commerce",
  basePath: '/api/briefing',
};

module.exports = { router, meta };
