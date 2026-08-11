import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { getPublicSupabaseConfig, getServiceRoleKey } from '@/lib/env'

/**
 * Service-role クライアント (RLS バイパス)。サーバー専用。
 * portal スキーマをデフォルトにする。
 */
export function createServiceRoleClient() {
  const { url } = getPublicSupabaseConfig()
  const key = getServiceRoleKey()
  return createClient<Database, 'portal'>(url, key, {
    db: { schema: 'portal' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Service-role クライアント（public スキーマ・読み取り用）。サーバー専用。
 * 相乗り先の分析サイト（カーセンサー市場データ等）を参照するために使う。
 * public テーブルは Database 型に未登録のため、疎結合（loose typing）で扱う。
 */
export function createPublicReadClient() {
  const { url } = getPublicSupabaseConfig()
  const key = getServiceRoleKey()
  return createClient(url, key, {
    db: { schema: 'public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Service-role クライアント（public スキーマ・書き込み用）。サーバー専用・本部操作のみ。
 * 用途は「共有の収集設定テーブル（cs_market_search_templates）」の管理に限定する。
 * これは相乗り先の分析サイトも参照する共有設定で、VPS スクレイパの巡回対象を制御する。
 * ※分析サイトの「コード」は変更しない。あくまで共有の「データ設定」を編集する。
 * 実体は read クライアントと同一だが、書き込み意図を型/命名で明示するために分ける。
 */
export function createPublicWriteClient() {
  const { url } = getPublicSupabaseConfig()
  const key = getServiceRoleKey()
  return createClient(url, key, {
    db: { schema: 'public' },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
