const { generateEmbedding: embed } = require('./ai');
const supabase = require('./supabase');
const logger = require('./logger');

/**
 * Generate an embedding vector for the given text.
 * Uses OpenAI text-embedding-3-large at 1024 dimensions.
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} 1024-dimensional embedding vector
 */
async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot embed empty text');
  }
  return embed(text);
}

/**
 * Chunk text into smaller pieces for embedding.
 * @param {string} text - The text to chunk
 * @param {object} [options]
 * @param {number} [options.maxChunkSize=500] - Maximum words per chunk
 * @param {number} [options.overlap=50] - Word overlap between chunks
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, options = {}) {
  const { maxChunkSize = 500, overlap = 50 } = options;

  if (!text || text.trim().length === 0) return [];

  const words = text.split(/\s+/);
  if (words.length <= maxChunkSize) return [text.trim()];

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxChunkSize, words.length);
    chunks.push(words.slice(start, end).join(' '));
    start = end - overlap;
    if (start >= words.length - overlap) break;
  }

  // Catch any remaining words
  if (start < words.length && chunks.length > 0) {
    const lastChunk = words.slice(start).join(' ');
    if (lastChunk.split(/\s+/).length > overlap) {
      chunks.push(lastChunk);
    }
  }

  return chunks;
}

/**
 * Store an embedding in the briefing_embeddings table.
 * @param {object} params
 * @param {string} [params.rawItemId] - Associated raw item ID
 * @param {string} [params.episodeId] - Associated episode ID
 * @param {string} params.contentType - 'source_chunk' or 'episode_script'
 * @param {string} params.chunkText - The text that was embedded
 * @param {number} params.chunkIndex - Index of this chunk
 * @param {number[]} params.embedding - The embedding vector
 * @param {object} [params.metadata] - Additional metadata
 * @returns {Promise<object>} The inserted record
 */
async function storeEmbedding(params) {
  const { rawItemId, episodeId, contentType, chunkText, chunkIndex, embedding, metadata = {} } = params;

  const { data, error } = await supabase
    .from('briefing_embeddings')
    .insert({
      raw_item_id: rawItemId || null,
      episode_id: episodeId || null,
      content_type: contentType,
      chunk_text: chunkText,
      chunk_index: chunkIndex,
      embedding: `[${embedding.join(',')}]`,
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to store embedding: ${error.message}`);
  }

  return data;
}

/**
 * Perform semantic search across embeddings.
 * @param {string} queryText - The text to search for
 * @param {object} [options]
 * @param {number} [options.limit=5] - Number of results
 * @param {number} [options.threshold=0.7] - Minimum cosine similarity
 * @returns {Promise<Array>} Matching chunks with similarity scores
 */
async function semanticSearch(queryText, options = {}) {
  const { limit = 5, threshold = 0.7 } = options;

  const queryEmbedding = await generateEmbedding(queryText);

  const { data, error } = await supabase.rpc('match_embeddings', {
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Semantic search failed: ${error.message}`);
  }

  return data || [];
}

module.exports = { generateEmbedding, chunkText, storeEmbedding, semanticSearch };
