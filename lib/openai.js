const OpenAI = require('openai');
const logger = require('./logger');

if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY not configured. OpenAI API calls will fail.');
}

// Pass a placeholder key when env var is missing so the constructor doesn't throw.
// Actual API calls will fail at runtime with a clear error, but the server can boot.
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'placeholder-key-not-configured',
  maxRetries: 3,
});

const usage = {
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCalls: 0,
};

/**
 * Generate text using OpenAI Chat Completions API.
 * @param {object} params
 * @param {string} [params.system] - System prompt
 * @param {string} params.userMessage - User message
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @param {string} [params.model='gpt-4.1'] - Model ID
 * @returns {Promise<{text: string, usage: object}>}
 */
async function generateText({ system, userMessage, maxTokens = 4096, model = 'gpt-4.1' }) {
  const startTime = Date.now();

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: userMessage });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const durationMs = Date.now() - startTime;

    usage.totalInputTokens += inputTokens;
    usage.totalOutputTokens += outputTokens;
    usage.totalCalls += 1;

    logger.info('OpenAI chat completion', {
      model,
      inputTokens,
      outputTokens,
      durationMs,
    });

    return {
      text: response.choices[0].message.content,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
  } catch (err) {
    logger.error('OpenAI chat completion failed', {
      model,
      error: err.message,
      status: err.status,
    });
    throw err;
  }
}

/**
 * Multi-turn chat using OpenAI Chat Completions API.
 * @param {object} params
 * @param {string} [params.system] - System prompt
 * @param {Array<{role: string, content: string}>} params.messages - Conversation messages
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @param {string} [params.model='gpt-4.1'] - Model ID
 * @returns {Promise<{text: string, usage: object}>}
 */
async function generateChat({ system, messages, maxTokens = 4096, model = 'gpt-4.1' }) {
  const startTime = Date.now();

  const allMessages = [];
  if (system) allMessages.push({ role: 'system', content: system });
  allMessages.push(...messages);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: allMessages,
      max_tokens: maxTokens,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const durationMs = Date.now() - startTime;

    usage.totalInputTokens += inputTokens;
    usage.totalOutputTokens += outputTokens;
    usage.totalCalls += 1;

    logger.info('OpenAI chat completion (multi-turn)', {
      model,
      inputTokens,
      outputTokens,
      durationMs,
      turns: messages.length,
    });

    return {
      text: response.choices[0].message.content,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
  } catch (err) {
    logger.error('OpenAI chat completion failed', {
      model,
      error: err.message,
      status: err.status,
    });
    throw err;
  }
}

/**
 * Web search using OpenAI Responses API with web_search_preview tool.
 * @param {object} params
 * @param {string} params.userMessage - The search/analysis prompt
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @param {string} [params.model='gpt-4.1'] - Model ID
 * @returns {Promise<{text: string, usage: object}>}
 */
async function webSearch({ userMessage, maxTokens = 4096, model = 'gpt-4.1' }) {
  const startTime = Date.now();

  try {
    const response = await client.responses.create({
      model,
      tools: [{ type: 'web_search_preview' }],
      input: userMessage,
      max_output_tokens: maxTokens,
    });

    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const durationMs = Date.now() - startTime;

    usage.totalInputTokens += inputTokens;
    usage.totalOutputTokens += outputTokens;
    usage.totalCalls += 1;

    logger.info('OpenAI web search', {
      model,
      inputTokens,
      outputTokens,
      durationMs,
    });

    return {
      text: response.output_text,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
  } catch (err) {
    logger.error('OpenAI web search failed', {
      model,
      error: err.message,
      status: err.status,
    });
    throw err;
  }
}

/**
 * Generate embedding vector using OpenAI text-embedding-3-large.
 * @param {string} text - Text to embed
 * @param {object} [options]
 * @param {number} [options.dimensions=1024] - Output dimensions
 * @returns {Promise<number[]>} Embedding vector
 */
async function generateEmbedding(text, options = {}) {
  const dimensions = options.dimensions || 1024;

  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-large',
      input: text,
      dimensions,
    });

    usage.totalCalls += 1;

    return response.data[0].embedding;
  } catch (err) {
    logger.error('OpenAI embedding failed', { error: err.message });
    throw err;
  }
}

/**
 * Get cumulative usage statistics.
 */
function getUsage() {
  return { ...usage };
}

module.exports = { client, generateText, generateChat, webSearch, generateEmbedding, getUsage };
