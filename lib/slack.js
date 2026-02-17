const logger = require('./logger');

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Send a notification to Slack via incoming webhook.
 * @param {object} params
 * @param {string} params.text - The notification text
 * @param {Array} [params.blocks] - Slack Block Kit blocks for rich formatting
 * @returns {Promise<void>}
 */
async function notify({ text, blocks }) {
  if (!SLACK_WEBHOOK_URL) {
    logger.warn('Slack webhook URL not configured, skipping notification');
    return;
  }

  try {
    const body = { text };
    if (blocks) {
      body.blocks = blocks;
    }

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Slack webhook returned ${response.status}: ${responseText}`);
    }

    logger.info('Slack notification sent');
  } catch (err) {
    logger.error('Failed to send Slack notification', { error: err.message });
  }
}

module.exports = { notify };
