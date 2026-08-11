import { createBrowserClient } from '@supabase/ssr'
import { getPublicSupabaseConfig } from '@/lib/env'
import type { Database } from '@/types/database'

/** ブラウザ用クライアント。portal スキーマをデフォルトにする。 */
export function createClient() {
  const { url, anonKey } = getPublicSupabaseConfig()
  return createBrowserClient<Database, 'portal'>(url, anonKey, {
    db: { schema: 'portal' },
  })
}
