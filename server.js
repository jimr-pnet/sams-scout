require('dotenv').config();

const express = require('express');
const cors = require('cors');
const logger = require('./lib/logger');
const agentRegistry = require('./agents');
const errorHandler = require('./middleware/errorHandler');
const { runMigrations } = require('./lib/migrate');
const { ensureSeedData } = require('./lib/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow Lovable frontend and local dev
const allowedOrigins = [
  'https://sam-scout.lovable.app',
  'https://id-preview--ca526d73-7f43-4667-95e8-f80e53a855f2.lovable.app',
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (curl, server-to-server, mobile)
    if (!origin) return callback(null, true);
    // Allow exact matches and any *.lovable.app / *.lovable.dev subdomain
    if (
      allowedOrigins.includes(origin) ||
      /\.lovable\.app$/.test(origin) ||
      /\.lovable\.dev$/.test(origin)
    ) {
      return callback(null, true);
    }
    logger.warn('CORS rejected origin', { origin });
    callback(null, false);
  },
  credentials: true,
}));
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

  // Run pending database migrations, then verify seed data exists
  runMigrations()
    .then(() => ensureSeedData())
    .catch(err => {
      logger.error('Startup migrations/seed failed', { error: err.message });
    });
});
