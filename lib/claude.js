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
 * Generate text using Claude Messages API.
 * Normalised interface matching lib/openai.js.
 * @param {object} params
 * @param {string} [params.system] - System prompt
 * @param {string} params.userMessage - User message
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @param {string} [params.model='claude-sonnet-4-5-20250929'] - Model ID
 * @returns {Promise<{text: string, usage: object}>}
 */
async function generateText({ system, userMessage, maxTokens = 4096, model = 'claude-sonnet-4-5-20250929' }) {
  const params = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userMessage }],
  };
  if (system) params.system = system;

  const response = await callClaude(params);
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return {
    text,
    usage: {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
    },
  };
}

/**
 * Web search using Claude with web_search tool.
 * Normalised interface matching lib/openai.js.
 * @param {object} params
 * @param {string} params.userMessage - The search/analysis prompt
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @param {string} [params.model='claude-sonnet-4-5-20250929'] - Model ID
 * @returns {Promise<{text: string, usage: object}>}
 */
async function webSearch({ userMessage, maxTokens = 4096, model = 'claude-sonnet-4-5-20250929' }) {
  const response = await callClaude({
    model,
    max_tokens: maxTokens,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return {
    text,
    usage: {
      input_tokens: response.usage?.input_tokens || 0,
      output_tokens: response.usage?.output_tokens || 0,
    },
  };
}

/**
 * Get cumulative usage statistics.
 * @returns {object} Usage totals
 */
function getUsage() {
  return { ...usage };
}

module.exports = { client, callClaude, generateText, webSearch, getUsage };
