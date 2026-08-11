import { createClient } from '@supabase/supabase-js'
import { getPublicSupabaseConfig, getServiceRoleKey, getSiteUrl } from '@/lib/env'

/**
 * Supabase の admin API で認証アクションリンク (招待 / パスワード再設定) を生成する。
 * トークンの生成・検証は Supabase に委譲し (パターンX)、メール配信のみ自前 SMTP で行う。
 * サーバー専用。
 */
function authAdminClient() {
  const { url } = getPublicSupabaseConfig()
  return createClient(url, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** 招待リンク (新規ユーザー向け。初回パスワード設定へ誘導)。 */
export async function generateInviteLink(email: string): Promise<string> {
  const supabase = authAdminClient()
  const redirectTo = `${getSiteUrl()}/set-password`
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })
  if (error) throw new Error(error.message)
  return data.properties.action_link
}

/** パスワード再設定リンク (既存ユーザー向け)。 */
export async function generateRecoveryLink(email: string): Promise<string> {
  const supabase = authAdminClient()
  const redirectTo = `${getSiteUrl()}/set-password`
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })
  if (error) throw new Error(error.message)
  return data.properties.action_link
}
