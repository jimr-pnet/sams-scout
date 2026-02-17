/**
 * AI Provider Abstraction Layer
 *
 * Routes calls to Claude (Anthropic) or OpenAI based on provider selection.
 * All consumers import from here instead of directly from claude.js / openai.js.
 */
const claude = require('./claude');
const openai = require('./openai');
const logger = require('./logger');

const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'claude';

const PROVIDERS = {
  claude: {
    id: 'claude',
    name: 'Claude (Anthropic)',
    models: { text: 'claude-sonnet-4-5-20250929', search: 'claude-sonnet-4-5-20250929' },
    module: claude,
  },
  openai: {
    id: 'openai',
    name: 'GPT-4.1 (OpenAI)',
    models: { text: 'gpt-4.1', search: 'gpt-4.1' },
    module: openai,
  },
};

function resolveProvider(provider) {
  const id = provider || DEFAULT_PROVIDER;
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown AI provider: ${id}`);
  return p;
}

/**
 * Generate text using the selected provider.
 * @param {object} params
 * @param {string} [params.provider] - 'claude' or 'openai' (defaults to AI_PROVIDER env)
 * @param {string} [params.system] - System prompt
 * @param {string} params.userMessage - User message
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @returns {Promise<{text: string, usage: object, provider: string}>}
 */
async function generateText({ provider, system, userMessage, maxTokens = 4096 }) {
  const p = resolveProvider(provider);
  logger.debug('generateText', { provider: p.id });

  const result = await p.module.generateText({ system, userMessage, maxTokens });
  return { ...result, provider: p.id };
}

/**
 * Web search using the selected provider.
 * Claude uses web_search_20250305 tool; OpenAI uses Responses API web_search_preview.
 * @param {object} params
 * @param {string} [params.provider] - 'claude' or 'openai'
 * @param {string} params.userMessage - The search/analysis prompt
 * @param {number} [params.maxTokens=4096] - Max output tokens
 * @returns {Promise<{text: string, usage: object, provider: string}>}
 */
async function webSearch({ provider, userMessage, maxTokens = 4096 }) {
  const p = resolveProvider(provider);
  logger.debug('webSearch', { provider: p.id });

  const result = await p.module.webSearch({ userMessage, maxTokens });
  return { ...result, provider: p.id };
}

/**
 * Generate embedding vector. Always uses OpenAI text-embedding-3-large.
 * (Anthropic does not offer an embedding model.)
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} 1024-dimensional embedding vector
 */
async function generateEmbedding(text) {
  return openai.generateEmbedding(text, { dimensions: 1024 });
}

/**
 * List available providers and whether they have keys configured.
 * @returns {Array<{id: string, name: string, available: boolean, models: object}>}
 */
function getProviders() {
  return Object.values(PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    models: p.models,
    available: p.id === 'claude'
      ? !!process.env.ANTHROPIC_API_KEY
      : !!process.env.OPENAI_API_KEY,
  }));
}

/**
 * Get the current default provider.
 * @returns {string}
 */
function getDefaultProvider() {
  return DEFAULT_PROVIDER;
}

module.exports = { generateText, webSearch, generateEmbedding, getProviders, getDefaultProvider };
