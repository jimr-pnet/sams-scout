const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;
const isProduction = process.env.NODE_ENV === 'production';

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString();

  if (isProduction) {
    return JSON.stringify({ timestamp, level, message, ...meta });
  }

  const metaStr = meta && Object.keys(meta).length > 0
    ? ' ' + JSON.stringify(meta)
    : '';
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
}

function log(level, message, meta = {}) {
  if (LOG_LEVELS[level] > currentLevel) return;

  const formatted = formatMessage(level, message, meta);
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(formatted + '\n');
}

const logger = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta),
};

module.exports = logger;
