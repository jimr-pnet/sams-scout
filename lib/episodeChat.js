/**
 * Episode-aware conversational chat with server-side session persistence.
 *
 * Fetches recent episodes from Supabase as context, stores conversation
 * history in briefing_chat_sessions / briefing_chat_messages so it
 * survives page refreshes and works across devices.
 */

const supabase = require('./supabase');
const { generateChat } = require('./ai');
const logger = require('./logger');

const SYSTEM_PROMPT = `You are a sharp, knowledgeable colleague helping Sam — MD of PropellerNet, a Brighton digital marketing agency — make sense of his daily morning briefing on agentic commerce and AI disruption.

You have access to recent briefing episodes (summaries, scripts, sources). Use them to answer Sam's questions.

Keep it conversational. Talk like a smart colleague over coffee, not a report generator.

Rules:
- Short replies. Two to three paragraphs max unless Sam specifically asks for more detail.
- No markdown formatting. No headers, no bold, no bullet lists, no numbered lists. Just plain flowing text.
- Mention episode dates naturally ("in Monday's briefing..." or "the 17 Feb episode covered...") rather than structured citations.
- If the episodes don't cover what Sam's asking, say so plainly.
- British English.
- Never make up sources or claims that aren't in the episode data.`;

// Maximum number of prior messages to load from a session for context
const MAX_HISTORY_MESSAGES = 30;

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

    let block = `Episode: ${ep.date}\nSummary: ${ep.summary || 'No summary'}`;

    if (sections) block += `\nSections:\n${sections}`;
    if (sources) block += `\nSources:\n${sources}`;

    // Include full script for the most recent episode only (to stay within token limits)
    if (ep === episodes[0] && ep.clean_script) {
      block += `\nFull Script:\n${ep.clean_script}`;
    }

    return block;
  });

  return `Recent Briefing Episodes (${episodes.length} most recent)\n\n${blocks.join('\n\n---\n\n')}`;
}

/**
 * Create a new chat session.
 * @returns {Promise<string>} The new session ID
 */
async function createSession() {
  const { data, error } = await supabase
    .from('briefing_chat_sessions')
    .insert({})
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create chat session: ${error.message}`);
  return data.id;
}

/**
 * Load message history for a session.
 * @param {string} sessionId
 * @returns {Promise<Array<{role: string, content: string, created_at: string}>>}
 */
async function loadHistory(sessionId) {
  const { data, error } = await supabase
    .from('briefing_chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(MAX_HISTORY_MESSAGES);

  if (error) {
    logger.error('Failed to load chat history', { sessionId, error: error.message });
    return [];
  }

  return data || [];
}

/**
 * Save a message to a session.
 * @param {string} sessionId
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content
 */
async function saveMessage(sessionId, role, content) {
  const { error } = await supabase
    .from('briefing_chat_messages')
    .insert({ session_id: sessionId, role, content });

  if (error) {
    logger.error('Failed to save chat message', { sessionId, role, error: error.message });
  }

  // Touch session updated_at
  await supabase
    .from('briefing_chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

/**
 * Chat with full episode context and server-side session persistence.
 *
 * @param {string} message - User's latest question
 * @param {object} [options]
 * @param {string} [options.sessionId] - Existing session ID (omit to start new session)
 * @returns {Promise<{reply: string, sessionId: string}>}
 */
async function chatWithEpisodes(message, options = {}) {
  let { sessionId } = options;

  // Create session if none provided
  if (!sessionId) {
    sessionId = await createSession();
    logger.info('New chat session created', { sessionId });
  }

  // Load prior history from DB
  const history = await loadHistory(sessionId);

  logger.info('Episode chat', {
    sessionId,
    messageLength: message.length,
    historyTurns: history.length,
  });

  // Save user message
  await saveMessage(sessionId, 'user', message);

  // Build episode context
  const episodeContext = await buildEpisodeContext();

  // Build messages array from stored history + current message
  const messages = [];

  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  // Current message with episode context injected
  messages.push({
    role: 'user',
    content: `${episodeContext}\n\n---\n\n${message}`,
  });

  const { text } = await generateChat({
    system: SYSTEM_PROMPT,
    messages,
    maxTokens: 1024,
  });

  const reply = text.trim();

  // Save assistant reply
  await saveMessage(sessionId, 'assistant', reply);

  return { reply, sessionId };
}

/**
 * List chat sessions with a preview of the first message.
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
async function listSessions(limit = 20) {
  const { data: sessions, error } = await supabase
    .from('briefing_chat_sessions')
    .select('id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('Failed to list chat sessions', { error: error.message });
    return [];
  }

  if (!sessions || sessions.length === 0) return [];

  // Fetch first user message for each session as preview
  const sessionIds = sessions.map(s => s.id);
  const { data: firstMessages } = await supabase
    .from('briefing_chat_messages')
    .select('session_id, content')
    .in('session_id', sessionIds)
    .eq('role', 'user')
    .order('created_at', { ascending: true });

  // Build a map of session_id → first user message
  const previewMap = {};
  if (firstMessages) {
    for (const msg of firstMessages) {
      if (!previewMap[msg.session_id]) {
        previewMap[msg.session_id] = msg.content.substring(0, 120);
      }
    }
  }

  return sessions.map(s => ({
    id: s.id,
    created_at: s.created_at,
    updated_at: s.updated_at,
    preview: previewMap[s.id] || '',
  }));
}

/**
 * Get full message history for a session.
 * @param {string} sessionId
 * @returns {Promise<{sessionId: string, messages: Array}>}
 */
async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('briefing_chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load session: ${error.message}`);
  }

  return { sessionId, messages: data || [] };
}

module.exports = { chatWithEpisodes, listSessions, getSession };
