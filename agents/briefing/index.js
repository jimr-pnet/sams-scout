const express = require('express');
const cron = require('node-cron');
const router = express.Router();
const auth = require('../../middleware/auth');
const logger = require('../../lib/logger');
const { runPipeline } = require('./pipeline');

// GET /episodes — paginated episode list
router.get('/episodes', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'GET /episodes' });
  } catch (err) {
    next(err);
  }
});

// GET /episodes/latest — today's episode (must be before :id route)
router.get('/episodes/latest', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'GET /episodes/latest' });
  } catch (err) {
    next(err);
  }
});

// GET /episodes/:id — full episode with sections + sources
router.get('/episodes/:id', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'GET /episodes/:id' });
  } catch (err) {
    next(err);
  }
});

// GET /audio/:id.mp3 — audio file streaming
router.get('/audio/:id.mp3', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'GET /audio/:id.mp3' });
  } catch (err) {
    next(err);
  }
});

// POST /chat — knowledge base chat (semantic search + Claude)
router.post('/chat', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'POST /chat' });
  } catch (err) {
    next(err);
  }
});

// GET /queries — list standing search queries
router.get('/queries', async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'GET /queries' });
  } catch (err) {
    next(err);
  }
});

// POST /queries — add a standing query
router.post('/queries', auth, async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'POST /queries' });
  } catch (err) {
    next(err);
  }
});

// DELETE /queries/:id — remove a standing query
router.delete('/queries/:id', auth, async (req, res, next) => {
  try {
    res.status(501).json({ error: 'Not implemented', endpoint: 'DELETE /queries/:id' });
  } catch (err) {
    next(err);
  }
});

// POST /generate — manual pipeline trigger
router.post('/generate', auth, async (req, res, next) => {
  try {
    // Fire and forget — pipeline runs in background
    runPipeline().catch(err => {
      logger.error('Manual pipeline run failed', { error: err.message });
    });

    res.status(202).json({
      status: 'started',
      message: 'Pipeline triggered. Results will appear in the database and Slack.',
    });
  } catch (err) {
    next(err);
  }
});

// Schedule cron job for automated daily runs
const cronExpression = process.env.BRIEFING_CRON || '0 5 * * 1-5';

if (cron.validate(cronExpression)) {
  cron.schedule(cronExpression, () => {
    logger.info('Cron triggered: starting briefing pipeline');
    runPipeline().catch(err => {
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
