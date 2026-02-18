const fs = require('fs');
const path = require('path');
const { generateText } = require('../../lib/ai');
const logger = require('../../lib/logger');

const scoringPrompt = fs.readFileSync(
  path.join(__dirname, 'prompts', 'scoring.txt'),
  'utf-8'
);
const contextPrompt = fs.readFileSync(
  path.join(__dirname, 'prompts', 'context.txt'),
  'utf-8'
);

/**
 * Score raw items for relevance using a single AI call.
 * Returns the items sorted by score with scores attached,
 * filtered to the top items (default 8-12).
 *
 * @param {Array} items - Raw items with at least id, title, content_snippet, source_type, url
 * @param {object} [options]
 * @param {string} [options.provider] - AI provider ('claude' or 'openai')
 * @param {number} [options.minScore=6] - Minimum score to keep
 * @param {number} [options.maxItems=12] - Maximum items to return
 * @param {number} [options.minItems=8] - Minimum items to return (may lower minScore threshold)
 * @returns {Promise<Array>} Scored and filtered items
 */
async function scoreItems(items, options = {}) {
  const { provider, minScore = 6, maxItems = 12, minItems = 8 } = options;

  if (!items || items.length === 0) {
    logger.info('No items to score');
    return [];
  }

  logger.info(`Scoring ${items.length} items`, { provider: provider || 'default' });

  // Prepare items for the prompt — only send what the model needs
  const itemsForScoring = items.map(item => ({
    id: item.id || item._tempId,
    title: item.title,
    content_snippet: (item.content_snippet || item.content || '').substring(0, 500),
    source_type: item.source_type,
    url: item.url,
  }));

  const { text } = await generateText({
    provider,
    system: contextPrompt,
    userMessage: `${scoringPrompt}\n\n## Items to Score\n\n${JSON.stringify(itemsForScoring, null, 2)}`,
    maxTokens: 4096,
  });

  // Parse scores
  let scores;
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    scores = JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.error('Failed to parse scoring response', { error: err.message });
    // Fallback: return first maxItems items unsorted with neutral score
    logger.warn(`Scoring fallback: returning first ${maxItems} of ${items.length} items`);
    return items.slice(0, maxItems).map(item => ({ ...item, relevance_score: 5 }));
  }

  // Build a score lookup
  const scoreMap = new Map();
  for (const s of scores) {
    scoreMap.set(s.id, { score: s.score, reason: s.reason });
  }

  // Attach scores to items
  const scoredItems = items.map(item => {
    const id = item.id || item._tempId;
    const scoreData = scoreMap.get(id) || { score: 0, reason: 'Not scored' };
    return {
      ...item,
      relevance_score: scoreData.score,
      _scoreReason: scoreData.reason,
    };
  });

  // Sort by score descending
  scoredItems.sort((a, b) => b.relevance_score - a.relevance_score);

  // Filter: take top items above minScore, but ensure at least minItems
  let filtered = scoredItems.filter(item => item.relevance_score >= minScore);

  if (filtered.length < minItems) {
    // Relax threshold to get enough items
    filtered = scoredItems.slice(0, minItems);
  }

  // Cap at maxItems
  filtered = filtered.slice(0, maxItems);

  logger.info(`Scoring complete: ${filtered.length} items selected (scores ${filtered[filtered.length - 1]?.relevance_score}-${filtered[0]?.relevance_score})`);

  return filtered;
}

module.exports = { scoreItems };
