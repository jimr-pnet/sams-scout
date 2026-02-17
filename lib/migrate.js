/**
 * Lightweight migration runner for Supabase.
 *
 * Runs pending SQL migrations via the Supabase pg-meta API on server startup.
 * Each migration runs once — tracked in a `_migrations` table.
 *
 * Usage: require('./lib/migrate').runMigrations()
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

/**
 * Execute raw SQL against Supabase Postgres via the pg-meta HTTP endpoint.
 * This avoids needing `pg` or a DATABASE_URL — uses the service key you already have.
 */
async function execSQL(sql) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  }

  // Extract project ref from URL (e.g. "https://abcdef.supabase.co" → "abcdef")
  const ref = new URL(supabaseUrl).hostname.split('.')[0];

  // Use the pg-meta query endpoint
  const url = `${supabaseUrl}/pg/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-connection-encrypted': serviceKey,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SQL execution failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Ensure the _migrations tracking table exists.
 */
async function ensureMigrationsTable() {
  await execSQL(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

/**
 * Get list of already-executed migration names.
 */
async function getExecutedMigrations() {
  try {
    const result = await execSQL('SELECT name FROM _migrations ORDER BY name;');
    // pg-meta returns an array of row arrays
    if (Array.isArray(result) && result.length > 0) {
      // result is like [{ name: '001_initial_schema.sql' }, ...]
      return result.map(r => r.name || (Array.isArray(r) ? r[0] : null)).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Run all pending migrations in order.
 */
async function runMigrations() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logger.warn('Skipping migrations: Supabase credentials not configured');
    return;
  }

  try {
    logger.info('Checking for pending database migrations...');

    await ensureMigrationsTable();
    const executed = await getExecutedMigrations();

    // Read migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      logger.info('No migrations directory found');
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const pending = files.filter(f => !executed.includes(f));

    if (pending.length === 0) {
      logger.info('All migrations are up to date');
      return;
    }

    logger.info(`Running ${pending.length} pending migration(s): ${pending.join(', ')}`);

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      logger.info(`Running migration: ${file}`);

      try {
        await execSQL(sql);
        await execSQL(`INSERT INTO _migrations (name) VALUES ('${file}');`);
        logger.info(`Migration complete: ${file}`);
      } catch (err) {
        logger.error(`Migration failed: ${file}`, { error: err.message });
        throw err;
      }
    }

    logger.info(`All ${pending.length} migration(s) applied successfully`);
  } catch (err) {
    logger.error('Migration runner failed', { error: err.message });
    // Don't crash the server — log and continue
  }
}

module.exports = { runMigrations, execSQL };
