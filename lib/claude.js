const Anthropic = require('@anthropic-ai/sdk');
const logger = require('./logger');

if (!process.env.ANTHROPIC_API_KEY) {
  logger.warn('ANTHROPIC_API_KEY not configured. Claude API calls will fail.');
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 3,
});

const usage = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCalls: 0,
};

/**
 * Call Claude messages API with token tracking and cost logging.
 * @param {object} params - Parameters passed directly to messages.create()
 * @param {object} [options] - Request-level options
 * @returns {Promise<object>} The full API response
 */
async function callClaude(params, options = {}) {
  const startTime = Date.now();

  try {
    const response = await client.messages.create(params, options);

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const durationMs = Date.now() - startTime;

    usage.totalInputTokens += inputTokens;
    usage.totalOutputTokens += outputTokens;
    usage.totalCalls += 1;

    logger.info('Claude API call completed', {
      model: params.model,
      inputTokens,
      outputTokens,
      durationMs,
      stopReason: response.stop_reason,
    });

    return response;
  } catch (err) {
    logger.error('Claude API call failed', {
      model: params.model,
      error: err.message,
      status: err.status,
    });
    throw err;
  }
}

/**
 * Get cumulative usage statistics.
 * @returns {object} Usage totals
 */
function getUsage() {
  return { ...usage };
}

module.exports = { client, callClaude, getUsage };
