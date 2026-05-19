import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for routes that authenticate via something
 * OTHER than a Supabase session cookie (e.g. bearer-token routes hit by the
 * helldock-capture tray agent).
 *
 * NEVER import this from client code. The service-role key bypasses RLS.
 * NEVER expose the key in any response body or log line.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
