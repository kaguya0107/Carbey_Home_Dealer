import { Check, X, UserPlus, ShieldCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/auth/session'
import { FEATURES, FEATURE_LABEL, ACCESS_MATRIX, EDITABLE_ROLES, permKey, type Access } from '@/lib/auth/permissions'
import { listStaff } from '@/lib/portal/staff'
import { getRolePermissionOverrides, effectiveAllowed } from '@/lib/portal/role-permissions'
import { ROLE_LABEL } from '@/lib/portal/labels'
import { Badge } from '@/components/ui/Badge'
import type { UserRole } from '@/types/database'
import { updateRoleAction, updateStatusAction, inviteStaffAction, saveRolePermissionsAction } from './actions'

export const dynamic = 'force-dynamic'

const ROLES: UserRole[] = ['admin', 'crm_staff', 'chat_only', 'member']
const STAFF_ROLES: UserRole[] = ['admin', 'crm_staff', 'chat_only']

const field =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

const BANNERS: Record<string, { tone: string; text: string }> = {
  role: { tone: 'bg-green-50 text-green-700', text: 'ロールを変更しました。' },
  status: { tone: 'bg-green-50 text-green-700', text: '利用状態を変更しました。' },
  invited: { tone: 'bg-green-50 text-green-700', text: 'スタッフを招待しました（招待メールを送信）。' },
  perms: { tone: 'bg-green-50 text-green-700', text: '権限マトリクスを保存しました。' },
}
const ERRORS: Record<string, string> = {
  last_admin: '管理者が1名のため降格できません。先に別の管理者を追加してください。',
  self_suspend: '自分自身を停止することはできません。',
  smtp: 'メール送信が未設定のため招待できません（SMTP設定が必要です）。',
  email_required: 'メールアドレスを入力してください。',
  invalid: '入力内容が正しくありません。',
  invite: '招待に失敗しました。',
}

function AccessCell({ access }: { access: Access }) {
  if (access === 'full') return <Check className="mx-auto h-4 w-4 text-green-600" />
  if (access === 'none') return <X className="mx-auto h-4 w-4 text-slate-300" />
  if (access === 'own')
    return <span className="rounded bg-info-50 px-1.5 py-0.5 text-xs text-info-700">自分のみ</span>
  return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">任意</span>
}

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; msg?: string }>
}) {
  await requireAdmin()
  const sp = await searchParams
  const [staff, overrides] = await Promise.all([listStaff(), getRolePermissionOverrides()])

  const banner = sp.saved ? BANNERS[sp.saved] : undefined
  const errorText = sp.error ? `${ERRORS[sp.error] ?? '処理に失敗しました。'}${sp.msg ? ` (${sp.msg})` : ''}` : undefined

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-xl font-bold text-slate-900">権限管理</h1>
        <p className="text-sm text-slate-500">本部スタッフのロールを割り当て・招待します。加盟店は会員管理から招待されます。</p>
      </div>

      {banner && <div className={`rounded-lg px-4 py-3 text-sm ${banner.tone}`}>{banner.text}</div>}
      {errorText && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}

      {/* ===== スタッフ招待 ===== */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <UserPlus className="h-4 w-4 text-brand-500" /> スタッフを招待
        </h2>
        <form action={inviteStaffAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">メールアドレス *</label>
            <input name="email" type="email" required placeholder="staff@example.com" className={`${field} w-full`} />
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">氏名</label>
            <input name="name" placeholder="山田 太郎" className={`${field} w-full`} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">ロール</label>
            <select name="role" defaultValue="crm_staff" className={field}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            招待メールを送信
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-400">
          招待されたスタッフは、メール内のリンクからパスワードを設定してログインできます。
        </p>
      </section>

      {/* ===== スタッフ一覧 + ロール割り当て ===== */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">本部スタッフ（{staff.length}名）</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">氏名 / メール</th>
                <th className="px-4 py-3 font-medium">ロール</th>
                <th className="px-4 py-3 font-medium">利用状態</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">スタッフがいません。上のフォームから招待してください。</td>
                </tr>
              )}
              {staff.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{u.name ?? '（未設定）'}</div>
                    <div className="text-xs text-slate-500">{u.email ?? '—'}</div>
                  </td>
                  {/* ロール変更 (即時送信) */}
                  <td className="px-4 py-3">
                    <form action={updateRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} className={field}>
                        {STAFF_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                      <button className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        変更
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.status === 'active' ? 'green' : 'red'}>
                      {u.status === 'active' ? '有効' : '停止'}
                    </Badge>
                  </td>
                  {/* 状態トグル */}
                  <td className="px-4 py-3 text-right">
                    <form action={updateStatusAction} className="inline">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="status" value={u.status === 'active' ? 'suspended' : 'active'} />
                      <button className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        {u.status === 'active' ? '停止する' : '有効化する'}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== 権限マトリクス（編集：CRM入力担当・チャット専用のみ・機能ごと可否） ===== */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-slate-400" /> 権限マトリクス
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          各ロールが利用できる機能です。<span className="font-medium text-slate-600">CRM入力担当・チャット専用の列はチェックで可否を編集</span>できます。
          管理者は常に全権（固定）、加盟店は固定です。
        </p>
        <form action={saveRolePermissionsAction}>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">機能</th>
                  {ROLES.map((r) => (
                    <th key={r} className="px-4 py-3 text-center font-medium">
                      {ROLE_LABEL[r]}
                      {EDITABLE_ROLES.includes(r) ? <span className="ml-1 rounded bg-info-50 px-1 text-[10px] font-normal text-info-700">編集可</span> : <span className="ml-1 text-[10px] font-normal text-slate-400">固定</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FEATURES.map((f) => (
                  <tr key={f}>
                    <td className="px-4 py-3 font-medium text-slate-900">{FEATURE_LABEL[f]}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="px-4 py-3 text-center">
                        {EDITABLE_ROLES.includes(r) ? (
                          <input
                            type="checkbox"
                            name={`perm:${r}:${f}`}
                            value="1"
                            defaultChecked={effectiveAllowed(r, f, overrides)}
                            className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                          />
                        ) : (
                          <AccessCell access={ACCESS_MATRIX[f][r]} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-green-600" /> 全件アクセス</span>
              <span className="flex items-center gap-1"><span className="rounded bg-info-50 px-1.5 py-0.5 text-info-700">自分のみ</span> 自分のデータのみ</span>
              <span className="flex items-center gap-1"><span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">任意</span> プラン等で可変</span>
              <span className="flex items-center gap-1"><X className="h-3.5 w-3.5 text-slate-300" /> アクセス不可</span>
            </div>
            <button className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600">権限マトリクスを保存</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            ※ チェックを外すと、そのロールはメニュー・画面にアクセスできなくなります（サイドバーにも表示されません）。管理者は締め出し防止のため常に全権です。
          </p>
        </form>
      </section>
    </div>
  )
}
