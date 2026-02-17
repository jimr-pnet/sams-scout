const { textToSpeech } = require('../../lib/elevenlabs');
const supabase = require('../../lib/supabase');
const logger = require('../../lib/logger');

const STORAGE_BUCKET = 'briefing-audio';

/**
 * Generate audio from a clean script and upload to Supabase Storage.
 *
 * @param {string} cleanScript - Script text with source markers already stripped
 * @param {object} options
 * @param {string} options.episodeId - Episode UUID (used for file naming)
 * @param {string} [options.date] - Episode date string (YYYY-MM-DD)
 * @returns {Promise<object>} { audioUrl, audioDurationSeconds, audioSizeBytes }
 */
async function generateAudio(cleanScript, options = {}) {
  const { episodeId, date } = options;

  if (!cleanScript || cleanScript.length < 100) {
    throw new Error('Script too short for audio generation');
  }

  if (!episodeId) {
    throw new Error('episodeId is required for audio file naming');
  }

  logger.info('Generating audio', {
    episodeId,
    scriptLength: cleanScript.length,
    wordCount: cleanScript.split(/\s+/).length,
  });

  // Generate audio via ElevenLabs
  const audioBuffer = await textToSpeech(cleanScript);

  // Estimate duration from word count (~150 words per minute)
  const wordCount = cleanScript.split(/\s+/).length;
  const estimatedDuration = Math.round((wordCount / 150) * 60);

  // Upload to Supabase Storage
  const fileName = date
    ? `${date}-${episodeId}.mp3`
    : `${episodeId}.mp3`;
  const filePath = `episodes/${fileName}`;

  logger.info('Uploading audio to Supabase Storage', {
    bucket: STORAGE_BUCKET,
    filePath,
    sizeBytes: audioBuffer.length,
  });

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Audio upload failed: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  const audioUrl = urlData?.publicUrl;

  logger.info('Audio generation and upload complete', {
    episodeId,
    audioUrl,
    estimatedDuration,
    sizeBytes: audioBuffer.length,
  });

  return {
    audioUrl,
    audioDurationSeconds: estimatedDuration,
    audioSizeBytes: audioBuffer.length,
  };
}

module.exports = { generateAudio };
