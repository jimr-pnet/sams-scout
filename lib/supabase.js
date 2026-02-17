const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  logger.warn('Supabase credentials not configured. Database operations will fail.');
}

// Use a placeholder URL when credentials are missing so the module can still be required.
// Actual API calls will fail, but the server can boot for health checks.
const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_KEY || 'placeholder',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = supabase;
