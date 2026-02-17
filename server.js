require('dotenv').config();

const express = require('express');
const cors = require('cors');
const logger = require('./lib/logger');
const agentRegistry = require('./agents');
const errorHandler = require('./middleware/errorHandler');
const { runMigrations } = require('./lib/migrate');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount all agents
agentRegistry(app);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  logger.info(`PropellerNet Agent Platform running on port ${PORT}`);

  // Run pending database migrations in the background
  runMigrations().catch(err => {
    logger.error('Startup migrations failed', { error: err.message });
  });
});
