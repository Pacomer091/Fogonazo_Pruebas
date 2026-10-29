const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[SUPABASE] Cliente inicializado para:', supabaseUrl);
  } catch (err) {
    console.error('[SUPABASE] Error inicializando cliente:', err.message);
  }
}

module.exports = supabase;
