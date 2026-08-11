import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublicSupabaseConfig } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Server Component / Route Handler 用クライアント。
 * portal スキーマをデフォルトにする (相乗りのため public とは分離)。
 */
export async function createClient(): Promise<SupabaseClient<Database, 'portal'>> {
  const cookieStore = await cookies()
  const { url, anonKey } = getPublicSupabaseConfig()

  return createServerClient<Database, 'portal'>(url, anonKey, {
    db: { schema: 'portal' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // Server Component から呼ばれた場合は middleware がセッションを更新するため無視可
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options })
        } catch {
          // 同上
        }
      },
    },
  })
}

/**
 * auth.getUser() 等、認証だけ使いたい場面向け。スキーマ未指定 (public) のクライアント。
 * portal データを読むときは createClient() を使うこと。
 */
export async function createAuthClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  const { url, anonKey } = getPublicSupabaseConfig()
  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set() {},
      remove() {},
    },
  })
}
