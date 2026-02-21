const supabase = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { notify } = require('../../lib/slack');
const { getDefaultProvider } = require('../../lib/ai');
const { fetchSearchResults } = require('./sources/search');
const { scoreItems } = require('./scorer');
const { writeScript } = require('./scriptWriter');
const { generateAudio } = require('./tts');

/**
 * Main briefing pipeline orchestrator.
 * Coordinates: source collection (Tavily web search) → scoring → script writing → TTS → publishing.
 *
 * @param {object} [options]
 * @param {string} [options.provider] - AI provider ('claude' or 'openai'). Defaults to AI_PROVIDER env.
 * @returns {Promise<object>} The created episode record
 */
async function runPipeline(options = {}) {
  const provider = options.provider || getDefaultProvider();
  const onStatus = options.onStatus || (() => {});
  const date = new Date().toISOString().split('T')[0];
  let episodeId = null;

  logger.info('=== Briefing pipeline started ===', { date, provider });

  try {
    // Diagnostic: log source and query counts so we can see what's in the DB
    const { count: sourceCount, error: srcErr } = await supabase
      .from('briefing_sources')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    const { count: queryCount, error: qErr } = await supabase
      .from('briefing_search_queries')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);
    logger.info('Pipeline diagnostics', {
      activeSources: srcErr ? `error: ${srcErr.message}` : sourceCount,
      activeQueries: qErr ? `error: ${qErr.message}` : queryCount,
    });

    // Step 1: Collect sources via Tavily web search
    logger.info('Step 1: Collecting sources');
    onStatus({ step: 1, totalSteps: 11, status: 'running', message: 'Running standing web searches...', detail: null });

    const items = [];

    try {
      const results = await fetchSearchResults({ provider });
      items.push(...results);
      logger.info(`Web search: ${results.length} items`);
    } catch (err) {
      logger.error('Web search failed', { error: err.message });
    }

    // Step 2: Early exit if nothing collected
    if (items.length === 0) {
      logger.warn('No items collected — aborting pipeline');
      onStatus({ step: 2, totalSteps: 11, status: 'skipped', message: 'No items collected. Pipeline aborted.', detail: null });
      await notify({ text: `⚠️ Briefing pipeline for ${date}: No items collected. Skipping.` });
      return null;
    }

    logger.info(`Total items collected: ${items.length}`);

    // Step 2b: Deduplicate against recently ingested items (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentItems } = await supabase
      .from('briefing_raw_items')
      .select('url, title')
      .gte('fetched_at', sevenDaysAgo);

    if (recentItems && recentItems.length > 0) {
      const recentUrls = new Set(recentItems.map(r => r.url).filter(Boolean));
      const recentTitles = new Set(recentItems.map(r => (r.title || '').toLowerCase().trim()).filter(Boolean));
      const beforeCount = items.length;

      // Remove items whose URL or exact title already appeared in the last 7 days
      const deduped = items.filter(item => {
        if (item.url && recentUrls.has(item.url)) return false;
        if (item.title && recentTitles.has(item.title.toLowerCase().trim())) return false;
        return true;
      });

      const removed = beforeCount - deduped.length;
      if (removed > 0) {
        logger.info(`Deduplication: removed ${removed} items already seen in the last 7 days`);
        items.length = 0;
        items.push(...deduped);
      }
    }

    // Re-check after dedup
    if (items.length === 0) {
      logger.warn('All items were duplicates of recent content — aborting pipeline');
      onStatus({ step: 2, totalSteps: 11, status: 'skipped', message: 'All items were duplicates of recent content. Skipping.', detail: null });
      await notify({ text: `⚠️ Briefing pipeline for ${date}: All items duplicated recent content. Skipping.` });
      return null;
    }

    onStatus({ step: 1, totalSteps: 11, status: 'completed', message: `Collected ${items.length} items (after deduplication).`, detail: { itemCount: items.length } });

    // Step 3: Assign temp IDs for scoring reference
    items.forEach((item, i) => {
      item._tempId = `temp-${i}`;
    });

    // Step 4: Insert raw items into DB
    logger.info('Step 4: Inserting raw items into database');
    onStatus({ step: 4, totalSteps: 11, status: 'running', message: `Saving ${items.length} raw items to database...`, detail: null });
    const rowsToInsert = items.map(item => ({
      source_id: item.source_id || null,
      source_type: item.source_type,
      title: item.title,
      url: item.url,
      content: item.content,
      content_snippet: item.content_snippet,
      published_at: item.published_at,
      fetched_at: new Date().toISOString(),
      metadata: item.metadata || {},
      embedded: false,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from('briefing_raw_items')
      .insert(rowsToInsert)
      .select('id');

    if (insertError) {
      throw new Error(`Failed to insert raw items: ${insertError.message}`);
    }

    // Map temp IDs to real UUIDs
    for (let i = 0; i < items.length; i++) {
      items[i].id = insertedRows[i].id;
    }

    logger.info(`Inserted ${insertedRows.length} raw items`);
    onStatus({ step: 4, totalSteps: 11, status: 'completed', message: `Saved ${insertedRows.length} items.`, detail: null });

    // Step 5: Score items
    logger.info('Step 5: Scoring items');
    onStatus({ step: 5, totalSteps: 11, status: 'running', message: `Scoring ${items.length} items for relevance...`, detail: { itemCount: items.length } });
    const scoredItems = await scoreItems(items, { provider });
    logger.info(`Scoring complete: ${scoredItems.length} items passed filter`);
    onStatus({ step: 5, totalSteps: 11, status: 'completed', message: `${scoredItems.length} items passed the relevance filter.`, detail: { passedCount: scoredItems.length } });

    if (scoredItems.length === 0) {
      logger.warn('No items passed scoring — aborting pipeline');
      onStatus({ step: 5, totalSteps: 11, status: 'skipped', message: 'All items scored too low. Pipeline aborted.', detail: null });
      await notify({ text: `⚠️ Briefing pipeline for ${date}: All items scored too low. Skipping.` });
      return null;
    }

    // Step 6: Write script
    logger.info('Step 6: Writing script');
    onStatus({ step: 6, totalSteps: 11, status: 'running', message: `Writing the briefing script from ${scoredItems.length} sources...`, detail: null });
    const scriptResult = await writeScript(scoredItems, { provider, date });
    const scriptWordCount = scriptResult.clean_script.split(/\s+/).length;
    logger.info('Script written', {
      wordCount: scriptWordCount,
      sections: scriptResult.sections.length,
      sourcesCited: scriptResult.source_item_ids.length,
    });
    onStatus({ step: 6, totalSteps: 11, status: 'completed', message: `Script written: ${scriptWordCount} words, ${scriptResult.sections.length} sections.`, detail: { wordCount: scriptWordCount, sectionCount: scriptResult.sections.length } });

    // Step 7: Create episode record
    logger.info('Step 7: Creating episode record');
    onStatus({ step: 7, totalSteps: 11, status: 'running', message: 'Creating episode record...', detail: null });
    const { data: episode, error: episodeError } = await supabase
      .from('briefing_episodes')
      .insert({
        date,
        script: scriptResult.script,
        clean_script: scriptResult.clean_script,
        summary: scriptResult.summary,
        sections: scriptResult.sections,
        source_item_ids: scriptResult.source_item_ids,
        status: 'pending',
        metadata: { provider },
      })
      .select()
      .single();

    if (episodeError) {
      throw new Error(`Failed to create episode: ${episodeError.message}`);
    }

    episodeId = episode.id;
    logger.info('Episode created', { episodeId });
    onStatus({ step: 7, totalSteps: 11, status: 'completed', message: 'Episode record created.', detail: { episodeId } });

    // Step 8: Generate audio
    logger.info('Step 8: Generating audio');
    onStatus({ step: 8, totalSteps: 11, status: 'running', message: 'Generating audio with ElevenLabs... this may take a minute or two.', detail: null });
    const audioResult = await generateAudio(scriptResult.clean_script, {
      episodeId,
      date,
    });
    logger.info('Audio generated', {
      audioUrl: audioResult.audioUrl,
      duration: audioResult.audioDurationSeconds,
    });
    onStatus({ step: 8, totalSteps: 11, status: 'completed', message: `Audio generated: ~${Math.round(audioResult.audioDurationSeconds / 60)} minutes.`, detail: { audioUrl: audioResult.audioUrl, durationSeconds: audioResult.audioDurationSeconds } });

    // Step 9: Update episode with audio info
    logger.info('Step 9: Updating episode with audio');
    onStatus({ step: 9, totalSteps: 11, status: 'running', message: 'Finalising episode with audio...', detail: null });
    const { error: updateError } = await supabase
      .from('briefing_episodes')
      .update({
        audio_url: audioResult.audioUrl,
        audio_duration_seconds: audioResult.audioDurationSeconds,
        status: 'generated',
      })
      .eq('id', episodeId);

    if (updateError) {
      throw new Error(`Failed to update episode with audio: ${updateError.message}`);
    }

    // Step 10: Update raw items with episode_id and scores
    logger.info('Step 10: Updating raw items with scores');
    onStatus({ step: 10, totalSteps: 11, status: 'running', message: 'Updating source items with scores...', detail: null });
    for (const item of scoredItems) {
      await supabase
        .from('briefing_raw_items')
        .update({
          episode_id: episodeId,
          relevance_score: item.relevance_score,
        })
        .eq('id', item.id);
    }

    // Step 11: Slack notification
    onStatus({ step: 11, totalSteps: 11, status: 'running', message: 'Sending Slack notification...', detail: null });
    const wordCount = scriptResult.clean_script.split(/\s+/).length;
    const providerLabel = provider === 'openai' ? 'GPT-4.1' : 'Claude';
    await notify({
      text: `🎙️ Morning briefing for ${date} is ready!`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🎙️ Morning Briefing — ${date}*\n${scriptResult.summary}`,
          },
        },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `${wordCount} words · ~${Math.round(audioResult.audioDurationSeconds / 60)} min · ${scoredItems.length} sources · ${providerLabel}`,
          }],
        },
      ],
    });

    logger.info('=== Briefing pipeline complete ===', { date, episodeId, provider });
    onStatus({ step: 11, totalSteps: 11, status: 'completed', message: 'Pipeline complete! Your briefing is ready.', detail: { episodeId, date } });

    return { ...episode, audio_url: audioResult.audioUrl, audio_duration_seconds: audioResult.audioDurationSeconds, status: 'generated' };
  } catch (err) {
    logger.error('Pipeline failed', { date, episodeId, provider, error: err.message, stack: err.stack });
    onStatus({ step: 0, totalSteps: 11, status: 'failed', message: `Pipeline failed: ${err.message}`, detail: { error: err.message } });

    // Mark episode as failed if one was created
    if (episodeId) {
      await supabase
        .from('briefing_episodes')
        .update({
          status: 'failed',
          metadata: { provider, error: err.message },
        })
        .eq('id', episodeId)
        .catch(updateErr => logger.error('Failed to mark episode as failed', { error: updateErr.message }));
    }

    await notify({ text: `❌ Briefing pipeline failed for ${date}: ${err.message}` }).catch(() => {});

    throw err;
  }
}

module.exports = { runPipeline };
