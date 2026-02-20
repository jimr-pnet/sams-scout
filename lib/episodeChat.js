/**
 * Episode-aware conversational chat.
 *
 * Fetches recent episodes (summaries, sections, sources) from Supabase
 * and provides them as context to the AI so Sam can ask questions about
 * past briefings.
 */

const supabase = require('./supabase');
const { generateChat } = require('./ai');
const logger = require('./logger');

const SYSTEM_PROMPT = `You are Sam's Morning Briefing assistant — a conversational AI that helps Sam, the Managing Director of PropellerNet, explore and discuss his daily briefing episodes.

## About PropellerNet

PropellerNet is a 60-person digital PR and marketing agency in Brighton, UK. Services: SEO, digital PR, paid media (Google Ads, Meta), content marketing. Their business model is heavily Google-dependent.

Sam is focused on how agentic commerce and AI-mediated discovery will disrupt the Google-centric marketing model.

## Your Role

You have access to Sam's recent briefing episodes — summaries, full scripts, section breakdowns, and source material. Use this data to answer his questions accurately and specifically.

## Rules

- Ground your answers in the episode data provided. Cite specific episodes by date when relevant.
- Be concise and direct — Sam values sharp, actionable insights over lengthy explanations.
- If asked about something not covered in the episodes, say so clearly rather than guessing.
- Use British English spelling and phrasing.
- Never fabricate sources or claims not present in the provided episode data.
- When Sam asks about trends or patterns, look across multiple episodes to identify them.`;

/**
 * Fetch recent episodes with their source items for context.
 * @param {number} [limit=10] - Number of recent episodes to fetch
 * @returns {Promise<string>} Formatted episode context
 */
async function buildEpisodeContext(limit = 10) {
  const { data: episodes, error } = await supabase
    .from('briefing_episodes')
    .select('id, date, summary, clean_script, sections, source_item_ids, status')
    .in('status', ['generated', 'delivered'])
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to fetch episodes for chat context', { error: error.message });
    return 'No episode data available.';
  }

  if (!episodes || episodes.length === 0) {
    return 'No episodes have been generated yet.';
  }

  // Collect all source item IDs across episodes
  const allSourceIds = episodes.flatMap(ep => ep.source_item_ids || []);
  let sourcesMap = {};

  if (allSourceIds.length > 0) {
    const { data: sources } = await supabase
      .from('briefing_raw_items')
      .select('id, title, url, source_type, relevance_score, content_snippet')
      .in('id', allSourceIds);

    if (sources) {
      for (const s of sources) {
        sourcesMap[s.id] = s;
      }
    }
  }

  // Format episodes as context
  const blocks = episodes.map(ep => {
    const sections = (ep.sections || [])
      .filter(s => s.title)
      .map(s => `  - ${s.label}: ${s.title}`)
      .join('\n');

    const sources = (ep.source_item_ids || [])
      .map(id => sourcesMap[id])
      .filter(Boolean)
      .map(s => `  - [${s.source_type}] ${s.title}${s.url ? ` (${s.url})` : ''}`)
      .join('\n');

    let block = `### Episode: ${ep.date}\n\n**Summary:** ${ep.summary || 'No summary'}`;

    if (sections) block += `\n\n**Sections:**\n${sections}`;
    if (sources) block += `\n\n**Sources:**\n${sources}`;

    // Include full script for the most recent episode only (to stay within token limits)
    if (ep === episodes[0] && ep.clean_script) {
      block += `\n\n**Full Script:**\n${ep.clean_script}`;
    }

    return block;
  });

  return `## Recent Briefing Episodes (${episodes.length} most recent)\n\n${blocks.join('\n\n---\n\n')}`;
}

/**
 * Chat with full episode context.
 *
 * @param {string} message - User's latest question
 * @param {object} [options]
 * @param {Array<{role: string, content: string}>} [options.history] - Previous conversation turns
 * @returns {Promise<string>} The assistant's reply
 */
async function chatWithEpisodes(message, options = {}) {
  const { history = [] } = options;

  logger.info('Episode chat', { messageLength: message.length, historyTurns: history.length });

  const episodeContext = await buildEpisodeContext();

  // Build the messages array: history + current message
  // Inject episode context into the first user message
  const messages = [];

  // Add conversation history
  for (const turn of history) {
    if (turn.role === 'user' || turn.role === 'assistant') {
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  // Add current message with episode context
  messages.push({
    role: 'user',
    content: `${episodeContext}\n\n---\n\n${message}`,
  });

  const { text } = await generateChat({
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 2048,
  });

  return text.trim();
}

module.exports = { chatWithEpisodes };
