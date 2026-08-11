import { requireMember } from '@/lib/auth/session'
import { getMemberByUserId } from '@/lib/portal/members'
import { MEMBER_STATUS_LABEL, PAYMENT_STATUS_LABEL, yen } from '@/lib/portal/labels'
import { CheckCircle2, Lock } from 'lucide-react'
import { PREFECTURES } from '@/lib/portal/prefectures'
import { updateOwnProfileAction } from './actions'
import type { MemberStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

const field =
  'w-full rounded-lg border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20'
const labelCls = 'mb-1 block text-sm font-medium text-slate-400'

const STATUS_STYLE: Record<MemberStatus, string> = {
  active: 'bg-brand-500/15 text-brand-400',
  pending: 'bg-amber-500/15 text-amber-400',
  suspended: 'bg-rose-500/15 text-rose-400',
  cancelled: 'bg-carbon-700 text-slate-500',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-carbon-700 py-2.5 last:border-0">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-right text-sm text-slate-200">{value || '—'}</dd>
    </div>
  )
}

export default async function MemberProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const session = await requireMember()
  const member = await getMemberByUserId(session.userId)
  const sp = await searchParams

  if (!member) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        会員情報が紐付いていません。本部にお問い合わせください。
      </div>
    )
  }

  const section = 'rounded-xl border border-carbon-700 bg-carbon-850/80 p-5'
  const heading = 'mb-4 text-sm font-semibold text-white'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold text-white">プロフィール</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[member.status as MemberStatus]}`}>
          {MEMBER_STATUS_LABEL[member.status as MemberStatus]}
        </span>
      </div>

      {sp.saved && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-300">
          <CheckCircle2 className="h-4 w-4" /> プロフィールを更新しました。
        </div>
      )}

      {/* ===== 編集可: 連絡先・陸送先 ===== */}
      <form action={updateOwnProfileAction} className="grid grid-cols-1 gap-5">
        <section className={section}>
          <h2 className={heading}>基本情報</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>担当者氏名 *</label><input name="member_name" required defaultValue={member.member_name ?? ''} className={field} /></div>
            <div><label className={labelCls}>会社名</label><input name="company_name" defaultValue={member.company_name ?? ''} className={field} /></div>
            <div><label className={labelCls}>携帯番号</label><input name="phone_mobile" defaultValue={member.phone_mobile ?? ''} className={field} /></div>
            <div><label className={labelCls}>固定電話</label><input name="phone_landline" defaultValue={member.phone_landline ?? ''} className={field} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>住所</label><input name="address" defaultValue={member.address ?? ''} className={field} /></div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-500">
                <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> メールアドレス（ログインID・変更不可）</span>
              </label>
              <input value={member.email ?? '—'} disabled className={`${field} cursor-not-allowed opacity-60`} />
              <p className="mt-1 text-xs text-slate-500">メールアドレスの変更は本部にお問い合わせください。</p>
            </div>
          </div>
        </section>

        <section className={section}>
          <h2 className={heading}>陸送先</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className={labelCls}>陸送先名</label><input name="delivery_name" defaultValue={member.delivery_name ?? ''} className={field} /></div>
            <div><label className={labelCls}>陸送先連絡先</label><input name="delivery_contact" defaultValue={member.delivery_contact ?? ''} className={field} /></div>
            <div className="sm:col-span-2"><label className={labelCls}>陸送先住所</label><input name="delivery_address" defaultValue={member.delivery_address ?? ''} className={field} /></div>
            {/* #52改 陸送先の都道府県（拠点）— 新規案件の陸送先の初期値になる */}
            <div>
              <label className={labelCls}>陸送先の都道府県（拠点）</label>
              <select name="delivery_pref" defaultValue={member.delivery_pref ?? ''} className={field}>
                <option value="">未設定</option>
                {PREFECTURES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">仕入れ案件の陸送先の初期値になります（案件ごとに変更も可能）。</p>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white glow-brand transition hover:bg-brand-600">
            変更を保存
          </button>
        </div>
      </form>

      {/* ===== 閲覧のみ: 契約情報 (本部管理) ===== */}
      <section className={`mt-5 ${section}`}>
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-white">
          <Lock className="h-3.5 w-3.5 text-slate-500" /> 契約情報
        </h2>
        <p className="mb-3 text-xs text-slate-500">契約・料金に関する項目は本部が管理します。変更は本部にお問い合わせください。</p>
        <dl>
          <Row label="プラン" value={member.plan?.name} />
          <Row label="契約日" value={member.contract_date} />
          <Row label="登録日" value={member.registration_date} />
          <Row label="月額費用" value={yen(member.monthly_fee_yen)} />
          <Row label="加盟金" value={yen(member.joining_fee_yen)} />
          <Row label="支払ステータス" value={PAYMENT_STATUS_LABEL[member.payment_status]} />
        </dl>
      </section>
    </div>
  )
}
