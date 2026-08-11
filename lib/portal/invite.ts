import { createClient } from '@supabase/supabase-js'
import { getPublicSupabaseConfig, getServiceRoleKey } from '@/lib/env'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { generateInviteLink } from '@/lib/auth/adminLinks'
import { sendEmail } from '@/lib/email/sendEmail'
import { inviteEmail } from '@/lib/email/templates'
import type { MemberRow, UserRole } from '@/types/database'

function authAdmin() {
  const { url } = getPublicSupabaseConfig()
  return createClient(url, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const supabase = authAdmin()
  // listUsers は admin 専用。件数が増えたらページング/検索に置き換える。
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(error.message)
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return found?.id ?? null
}

/** ランダムなパスワードを生成（本部発行用）。記号・英大小・数字を含む12文字。 */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digit = '23456789'
  const sym = '!@#$%&*'
  const all = upper + lower + digit + sym
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)]
  let pw = pick(upper) + pick(lower) + pick(digit) + pick(sym)
  for (let i = 0; i < 8; i++) pw += pick(all)
  return pw.split('').sort(() => Math.random() - 0.5).join('')
}

/**
 * 本部が加盟店のログイン認証情報を「発行」する（メール招待に依存しない発行型フロー）。
 *   1. auth.users を作成 or 取得し、パスワードを設定
 *   2. portal.users に指定ロールで登録
 *   3. members.user_id 紐付け
 *   4. オンボーディングタスクを生成（未生成なら）
 * 発行したパスワードを返す（本部が加盟店へ共有する。以降は本部からは再表示不可）。
 */
export async function issueMemberCredentials(
  member: MemberRow,
  opts?: { password?: string; role?: UserRole },
): Promise<{ password: string; userId: string }> {
  const email = member.email
  if (!email) throw new Error('会員にメールアドレスが登録されていません')
  const password = opts?.password?.trim() || generatePassword()
  const role: UserRole = opts?.role ?? 'member'

  const authClient = authAdmin()
  const portal = createServiceRoleClient()

  // 1. auth ユーザーを確保しパスワードを設定
  let userId = await findUserIdByEmail(email)
  if (!userId) {
    const { data, error } = await authClient.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw new Error(error.message)
    userId = data.user.id
  } else {
    // このメールの認証ユーザーが既に「別の会員」に紐付いていないか確認（1メール=1会員）
    const { data: linked } = await portal
      .from('members')
      .select('id, member_name')
      .eq('user_id', userId)
      .neq('id', member.id)
      .maybeSingle<{ id: string; member_name: string }>()
    if (linked) {
      throw new Error(`このメールアドレス（${email}）は既に別の会員「${linked.member_name}」のログインに使用されています。会員ごとに異なるメールアドレスを設定してください。`)
    }
    const { error } = await authClient.auth.admin.updateUserById(userId, { password })
    if (error) throw new Error(error.message)
  }

  // 2. portal.users に指定ロールで登録
  const { error: uErr } = await portal
    .from('users')
    .upsert({ id: userId, email, name: member.member_name, role } as never)
  if (uErr) throw new Error(uErr.message)

  // 3. members.user_id 紐付け
  const { error: mErr } = await portal.from('members').update({ user_id: userId } as never).eq('id', member.id)
  if (mErr) throw new Error(mErr.message)

  // 4. オンボーディングタスク生成（冪等）
  await portal.rpc('seed_onboarding_tasks', { p_member_id: member.id } as never)

  return { password, userId }
}

/**
 * 本部スタッフを招待する (管理者 / CRM入力担当 / チャット専用)。
 * 加盟店招待と違い members レコードには紐付けず、portal.users に指定ロールで登録する。
 *   1. auth.users を作成 (無ければ)
 *   2. portal.users に指定 role で upsert
 *   3. 招待リンクを生成し、自前SMTP で招待メールを送信
 */
export async function inviteStaff(email: string, name: string | null, role: UserRole): Promise<void> {
  if (!email) throw new Error('メールアドレスが必要です')
  if (role === 'member') throw new Error('スタッフ招待に加盟店ロールは指定できません')

  const authClient = authAdmin()
  const portal = createServiceRoleClient()

  // 1. auth ユーザー確保
  let userId = await findUserIdByEmail(email)
  if (!userId) {
    const { data, error } = await authClient.auth.admin.createUser({ email, email_confirm: true })
    if (error) throw new Error(error.message)
    userId = data.user.id
  }

  // 2. portal.users に指定ロールで登録
  const { error: uErr } = await portal
    .from('users')
    .upsert({ id: userId, email, name, role } as never)
  if (uErr) throw new Error(uErr.message)

  // 3. 招待リンク生成 + 自前SMTP 送信
  const link = await generateInviteLink(email)
  const { subject, html } = inviteEmail({ name: name ?? email, url: link })
  await sendEmail({ to: email, subject, html })
}
