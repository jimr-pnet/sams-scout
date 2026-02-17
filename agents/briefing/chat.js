const fs = require('fs');
const path = require('path');
const { generateText } = require('../../lib/ai');
const { semanticSearch } = require('../../lib/embeddings');
const logger = require('../../lib/logger');

const chatPrompt = fs.readFileSync(
  path.join(__dirname, 'prompts', 'chat.txt'),
  'utf-8'
);

/**
 * Knowledge base chat using semantic search + AI.
 *
 * @param {string} message - User's question
 * @param {object} [options]
 * @param {string} [options.provider] - AI provider ('claude' or 'openai')
 * @param {number} [options.limit=5] - Number of context chunks to retrieve
 * @returns {Promise<{answer: string, sources: Array}>}
 */
async function chat(message, options = {}) {
  const { provider, limit = 5 } = options;

  if (!message || message.trim().length === 0) {
    throw new Error('Message is required');
  }

  logger.info('Chat query', { messageLength: message.length, provider: provider || 'default' });

  // Retrieve relevant context via semantic search
  let contextChunks = [];
  try {
    contextChunks = await semanticSearch(message, { limit, threshold: 0.6 });
  } catch (err) {
    logger.warn('Semantic search failed, proceeding without context', { error: err.message });
  }

  // Build context block for the prompt
  const contextBlock = contextChunks.length > 0
    ? contextChunks.map((chunk, i) =>
      `[${i + 1}] (similarity: ${chunk.similarity?.toFixed(3) || 'N/A'})\n${chunk.chunk_text}`
    ).join('\n\n')
    : 'No relevant context found in the knowledge base.';

  const { text: answer } = await generateText({
    provider,
    system: chatPrompt,
    userMessage: `## Retrieved Context\n\n${contextBlock}\n\n## Question\n\n${message}`,
    maxTokens: 2048,
  });

  // Extract source references from context chunks
  const sources = contextChunks.map(chunk => ({
    chunk_text: chunk.chunk_text?.substring(0, 200),
    content_type: chunk.content_type,
    episode_id: chunk.episode_id,
    raw_item_id: chunk.raw_item_id,
    similarity: chunk.similarity,
  }));

  return { answer: answer.trim(), sources };
}

module.exports = { chat };
