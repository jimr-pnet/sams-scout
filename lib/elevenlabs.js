const logger = require('./logger');

const API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = 'https://api.elevenlabs.io/v1';

if (!API_KEY) {
  logger.warn('ELEVENLABS_API_KEY not configured. TTS will fail.');
}

/**
 * Convert text to speech using ElevenLabs API.
 * @param {string} text - The text to convert to speech
 * @param {object} [options]
 * @param {string} [options.voiceId] - Voice ID (defaults to BRIEFING_VOICE_ID env var)
 * @param {string} [options.modelId] - Model ID (defaults to eleven_multilingual_v2)
 * @param {number} [options.stability] - Stability (0-1, default 0.5)
 * @param {number} [options.similarityBoost] - Similarity boost (0-1, default 0.75)
 * @param {number} [options.style] - Style exaggeration (0-1, default 0.0)
 * @returns {Promise<Buffer>} Audio data as a Buffer (MP3)
 */
async function textToSpeech(text, options = {}) {
  const voiceId = options.voiceId || process.env.BRIEFING_VOICE_ID;
  if (!voiceId) {
    throw new Error('No voice ID provided. Set BRIEFING_VOICE_ID or pass options.voiceId');
  }

  const modelId = options.modelId || 'eleven_multilingual_v2';
  const stability = options.stability ?? 0.5;
  const similarityBoost = options.similarityBoost ?? 0.75;
  const style = options.style ?? 0.0;

  logger.info('Calling ElevenLabs TTS', {
    voiceId,
    modelId,
    textLength: text.length,
  });

  const startTime = Date.now();

  const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(300000), // 5 min timeout for long scripts
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No body');
    throw new Error(`ElevenLabs API error ${response.status}: ${errorBody}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const durationMs = Date.now() - startTime;

  logger.info('ElevenLabs TTS completed', {
    durationMs,
    audioSizeBytes: buffer.length,
  });

  return buffer;
}

/**
 * Get available voices from ElevenLabs.
 * @returns {Promise<Array>} Array of voice objects
 */
async function getVoices() {
  const response = await fetch(`${BASE_URL}/voices`, {
    headers: { 'xi-api-key': API_KEY },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error ${response.status}`);
  }

  const data = await response.json();
  return data.voices || [];
}

module.exports = { textToSpeech, getVoices };
