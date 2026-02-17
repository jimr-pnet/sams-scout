const logger = require('./logger');

if (!process.env.ELEVENLABS_API_KEY) {
  logger.warn('ELEVENLABS_API_KEY not configured. TTS will fail.');
}

/**
 * Convert text to speech using ElevenLabs API.
 * @param {string} text - The text to convert to speech
 * @param {object} [options]
 * @param {string} [options.voiceId] - Voice ID (defaults to BRIEFING_VOICE_ID env var)
 * @param {string} [options.modelId] - Model ID
 * @returns {Promise<Buffer>} Audio data as a Buffer
 */
async function textToSpeech(text, options = {}) {
  throw new Error('ElevenLabs TTS not yet implemented');
}

/**
 * Get available voices from ElevenLabs.
 * @returns {Promise<Array>} Array of voice objects
 */
async function getVoices() {
  throw new Error('ElevenLabs TTS not yet implemented');
}

module.exports = { textToSpeech, getVoices };
