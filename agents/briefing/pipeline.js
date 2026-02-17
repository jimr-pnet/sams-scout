const supabase = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { notify } = require('../../lib/slack');
const { getDefaultProvider } = require('../../lib/ai');
const { fetchRSS } = require('./sources/rss');
const { fetchSearchResults } = require('./sources/search');
const { scoreItems } = require('./scorer');
const { writeScript } = require('./scriptWriter');
const { generateAudio } = require('./tts');

/**
 * Main briefing pipeline orchestrator.
 * Coordinates: source collection → scoring → script writing → TTS → publishing.
 *
 * @param {object} [options]
 * @param {string} [options.provider] - AI provider ('claude' or 'openai'). Defaults to AI_PROVIDER env.
 * @returns {Promise<object>} The created episode record
 */
async function runPipeline(options = {}) {
  const provider = options.provider || getDefaultProvider();
  const date = new Date().toISOString().split('T')[0];
  let episodeId = null;

  logger.info('=== Briefing pipeline started ===', { date, provider });

  try {
    // Step 1: Collect sources in parallel
    logger.info('Step 1: Collecting sources');
    const [rssItems, searchItems] = await Promise.allSettled([
      fetchRSS(),
      fetchSearchResults({ provider }),
    ]);

    const items = [];
    if (rssItems.status === 'fulfilled') {
      items.push(...rssItems.value);
      logger.info(`RSS: ${rssItems.value.length} items`);
    } else {
      logger.error('RSS collection failed', { error: rssItems.reason.message });
    }
    if (searchItems.status === 'fulfilled') {
      items.push(...searchItems.value);
      logger.info(`Web search: ${searchItems.value.length} items`);
    } else {
      logger.error('Web search failed', { error: searchItems.reason.message });
    }

    // Step 2: Early exit if nothing collected
    if (items.length === 0) {
      logger.warn('No items collected — aborting pipeline');
      await notify({ text: `⚠️ Briefing pipeline for ${date}: No items collected. Skipping.` });
      return null;
    }

    logger.info(`Total items collected: ${items.length}`);

    // Step 3: Assign temp IDs for scoring reference
    items.forEach((item, i) => {
      item._tempId = `temp-${i}`;
    });

    // Step 4: Insert raw items into DB
    logger.info('Step 4: Inserting raw items into database');
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

    // Step 5: Score items
    logger.info('Step 5: Scoring items');
    const scoredItems = await scoreItems(items, { provider });
    logger.info(`Scoring complete: ${scoredItems.length} items passed filter`);

    if (scoredItems.length === 0) {
      logger.warn('No items passed scoring — aborting pipeline');
      await notify({ text: `⚠️ Briefing pipeline for ${date}: All items scored too low. Skipping.` });
      return null;
    }

    // Step 6: Write script
    logger.info('Step 6: Writing script');
    const scriptResult = await writeScript(scoredItems, { provider, date });
    logger.info('Script written', {
      wordCount: scriptResult.clean_script.split(/\s+/).length,
      sections: scriptResult.sections.length,
      sourcesCited: scriptResult.source_item_ids.length,
    });

    // Step 7: Create episode record
    logger.info('Step 7: Creating episode record');
    const { data: episode, error: episodeError } = await supabase
      .from('briefing_episodes')
      .insert({
        date,
        script: scriptResult.script,
        clean_script: scriptResult.clean_script,
        summary: scriptResult.summary,
        sections: scriptResult.sections,
        source_item_ids: scriptResult.source_item_ids,
        status: 'generating',
        metadata: { provider },
      })
      .select()
      .single();

    if (episodeError) {
      throw new Error(`Failed to create episode: ${episodeError.message}`);
    }

    episodeId = episode.id;
    logger.info('Episode created', { episodeId });

    // Step 8: Generate audio
    logger.info('Step 8: Generating audio');
    const audioResult = await generateAudio(scriptResult.clean_script, {
      episodeId,
      date,
    });
    logger.info('Audio generated', {
      audioUrl: audioResult.audioUrl,
      duration: audioResult.audioDurationSeconds,
    });

    // Step 9: Update episode with audio info
    logger.info('Step 9: Updating episode with audio');
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

    return { ...episode, audio_url: audioResult.audioUrl, audio_duration_seconds: audioResult.audioDurationSeconds, status: 'generated' };
  } catch (err) {
    logger.error('Pipeline failed', { date, episodeId, provider, error: err.message, stack: err.stack });

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
