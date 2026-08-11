import Link from 'next/link'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { requireFeature } from '@/lib/auth/session'
import { listPlans } from '@/lib/portal/plans'
import { createMemberAction } from '../actions'
import MemberFormFields from '../MemberFormFields'

export const dynamic = 'force-dynamic'

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  await requireFeature('members')
  const [plans, sp] = await Promise.all([listPlans(false), searchParams])

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/members" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" />
        会員一覧へ
      </Link>
      <h1 className="mb-6 text-xl font-bold text-slate-900">会員を登録</h1>

      {sp.error === 'name_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">担当者氏名は必須です。</div>
      )}
      {sp.error === 'contract_date_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          契約ステータスを「稼働中（active）」にするには契約日が必須です（古物商許可の6ヶ月猶予の起算日になります）。
        </div>
      )}
      {sp.error === 'email_duplicate' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          このメールアドレスは既に別の会員に登録されています。会員ごとに異なるメールアドレスを設定してください（1メール＝1会員）。
        </div>
      )}
      {sp.error === 'plan_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          契約ステータスを「稼働中（active）」にするには契約プランの選択が必須です。
        </div>
      )}
      {sp.error === 'grant_required' && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          契約ステータスを「稼働中（active）」にするには、運用方式の権限（セミオート／フルオート／両方）を1つ以上割り当ててください。
        </div>
      )}

      <form action={createMemberAction}>
        <MemberFormFields plans={plans} />

        {/* ===== ログイン発行・権限（⑤⑥：登録と同時に発行） ===== */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-500" />
            <h2 className="text-sm font-semibold text-slate-900">ログイン発行・権限</h2>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="issue_login" defaultChecked className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
            登録と同時にログイン情報を発行する（メールアドレスの登録が必要）
          </label>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">パスワード（空欄で自動生成）</label>
              <input name="password" placeholder="自動生成する場合は空欄" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">権限</label>
              <select disabled className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <option>加盟店（member）</option>
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            発行すると、次の画面にメール（ログインID）とパスワードが1回だけ表示されます。加盟店へお伝えいただくとそのままログインできます。
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link href="/admin/members" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            キャンセル
          </Link>
          <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            登録する
          </button>
        </div>
      </form>
    </div>
  )
}
