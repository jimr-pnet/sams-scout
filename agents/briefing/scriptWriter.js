const fs = require('fs');
const path = require('path');
const { generateText } = require('../../lib/ai');
const logger = require('../../lib/logger');

const scriptPrompt = fs.readFileSync(
  path.join(__dirname, 'prompts', 'script.txt'),
  'utf-8'
);
const contextPrompt = fs.readFileSync(
  path.join(__dirname, 'prompts', 'context.txt'),
  'utf-8'
);

/**
 * Generate a spoken-word briefing script from scored items.
 *
 * Returns:
 *   - script: full script with [source: {id}] markers
 *   - clean_script: script with markers stripped (ready for TTS)
 *   - sections: parsed section metadata for the frontend player
 *   - source_item_ids: array of referenced source UUIDs
 *
 * @param {Array} items - Scored items (with id, title, content, source_type, relevance_score)
 * @param {object} [options]
 * @param {string} [options.provider] - AI provider ('claude' or 'openai')
 * @param {string} [options.date] - Date string for the episode (defaults to today)
 * @returns {Promise<object>} { script, clean_script, sections, source_item_ids, summary }
 */
async function writeScript(items, options = {}) {
  const { provider, date = new Date().toISOString().split('T')[0] } = options;

  if (!items || items.length === 0) {
    throw new Error('No items provided for script generation');
  }

  logger.info(`Generating script from ${items.length} items for ${date}`, { provider: provider || 'default' });

  // Prepare source material
  const sourceMaterial = items.map(item => ({
    id: item.id,
    title: item.title,
    content: (item.content || '').substring(0, 2000),
    source_type: item.source_type,
    url: item.url,
    relevance_score: item.relevance_score,
  }));

  const { text: script } = await generateText({
    provider,
    system: contextPrompt,
    userMessage: `${scriptPrompt}\n\nToday's date: ${date}\n\n## Source Material\n\n${JSON.stringify(sourceMaterial, null, 2)}`,
    maxTokens: 8192,
  });

  if (!script || script.length < 200) {
    throw new Error('Script generation returned insufficient content');
  }

  // Strip source markers to produce clean script for TTS
  const clean_script = script.replace(/\[source:\s*[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();

  // Extract referenced source IDs
  const sourceRefs = [...script.matchAll(/\[source:\s*([^\]]+)\]/g)];
  const source_item_ids = [...new Set(sourceRefs.map(m => m[1].trim()))];

  // Parse sections from the script
  const sections = parseSections(script);

  // Generate a brief summary
  const summary = await generateSummary(script, provider);

  const wordCount = clean_script.split(/\s+/).length;
  const estimatedMinutes = (wordCount / 150).toFixed(1);

  logger.info(`Script generated: ${wordCount} words (~${estimatedMinutes} min), ${source_item_ids.length} sources cited, ${sections.length} sections`);

  return { script, clean_script, sections, source_item_ids, summary };
}

/**
 * Parse the script into sections with estimated timestamps.
 * Uses word count to estimate timing (~150 words per minute for TTS).
 */
function parseSections(script) {
  const wordsPerSecond = 150 / 60; // ~2.5 words/sec

  // Extract source IDs referenced in a block of text
  function getSourceIds(text) {
    const refs = [...text.matchAll(/\[source:\s*([^\]]+)\]/g)];
    return [...new Set(refs.map(m => m[1].trim()))];
  }

  // The script has no headers — split on paragraph breaks and assign labels
  // based on position and content length.
  const paragraphs = script.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length === 0) return [];

  const sections = [];
  let wordIndex = 0;

  // Opener: first paragraph
  const openerWords = paragraphs[0].split(/\s+/).length;
  sections.push({
    label: 'opener',
    title: null,
    word_index: 0,
    estimated_timestamp_seconds: 0,
    source_ids: getSourceIds(paragraphs[0]),
  });
  wordIndex += openerWords;

  // Main stories: middle paragraphs (up to second-to-last or third-to-last)
  const mainStart = 1;
  const mainEnd = Math.max(mainStart + 1, paragraphs.length - 2);
  let storyNum = 0;

  for (let i = mainStart; i < mainEnd && i < paragraphs.length; i++) {
    const paraWords = paragraphs[i].split(/\s+/).length;
    storyNum++;

    let label;
    if (storyNum <= 3) {
      label = `story_${storyNum}`;
    } else {
      label = 'deeper_thread';
    }

    // Extract a short title from the first sentence
    const firstSentence = paragraphs[i].replace(/\[source:[^\]]+\]/g, '').split(/[.!?]/)[0].trim();
    const title = firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;

    sections.push({
      label,
      title,
      word_index: wordIndex,
      estimated_timestamp_seconds: Math.round(wordIndex / wordsPerSecond),
      source_ids: getSourceIds(paragraphs[i]),
    });
    wordIndex += paraWords;
  }

  // Deeper thread if not already assigned and enough paragraphs
  const hasDeeper = sections.some(s => s.label === 'deeper_thread');
  if (!hasDeeper && paragraphs.length > 3) {
    const deeperIdx = mainEnd;
    if (deeperIdx < paragraphs.length) {
      const firstSentence = paragraphs[deeperIdx].replace(/\[source:[^\]]+\]/g, '').split(/[.!?]/)[0].trim();
      const title = firstSentence.length > 60 ? firstSentence.substring(0, 57) + '...' : firstSentence;
      sections.push({
        label: 'deeper_thread',
        title,
        word_index: wordIndex,
        estimated_timestamp_seconds: Math.round(wordIndex / wordsPerSecond),
        source_ids: getSourceIds(paragraphs[deeperIdx]),
      });
      wordIndex += paragraphs[deeperIdx].split(/\s+/).length;
    }
  }

  // Closer: last paragraph
  if (paragraphs.length > 1) {
    const lastPara = paragraphs[paragraphs.length - 1];
    sections.push({
      label: 'closer',
      title: null,
      word_index: wordIndex,
      estimated_timestamp_seconds: Math.round(wordIndex / wordsPerSecond),
      source_ids: getSourceIds(lastPara),
    });
  }

  return sections;
}

/**
 * Generate a 1-2 sentence summary of the briefing.
 */
async function generateSummary(script, provider) {
  try {
    const { text } = await generateText({
      provider,
      maxTokens: 200,
      userMessage: `Summarise this briefing script in one to two sentences for a podcast episode description. Be specific about the topics covered. No quotes or formatting.\n\n${script.substring(0, 3000)}`,
    });

    return text.trim();
  } catch (err) {
    logger.warn('Failed to generate summary', { error: err.message });
    return 'Daily intelligence briefing on agentic commerce and marketing disruption.';
  }
}

module.exports = { writeScript };
