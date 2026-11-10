import { createClient } from '@supabase/supabase-js';

export function createDatabaseClient(supabaseUrl, serviceRoleKey) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('supabaseUrl and serviceRoleKey are required to initialize database client');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'auth_util' },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
