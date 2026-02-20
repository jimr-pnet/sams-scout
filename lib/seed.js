/**
 * Startup seed verification.
 *
 * Search queries are managed entirely via the API / Supabase dashboard
 * so the user has full control. Source collection uses Tavily web search
 * only — no RSS/scrape sources to seed.
 */

const supabase = require('./supabase');
const logger = require('./logger');

async function ensureSeedData() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logger.warn('Skipping seed check: Supabase credentials not configured');
    return;
  }

  try {
    const { count: queryCount, error: queryErr } = await supabase
      .from('briefing_search_queries')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    if (queryErr) {
      logger.warn('Seed check: could not read tables (schema may not exist yet)', {
        queryErr: queryErr?.message,
      });
      return;
    }

    logger.info(`Seed check: ${queryCount} active search queries`);
  } catch (err) {
    logger.error('Seed verification failed', { error: err.message });
  }
}

module.exports = { ensureSeedData };
