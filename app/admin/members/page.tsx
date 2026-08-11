import { Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { requireFeature } from '@/lib/auth/session'
import { listMembers, listDeletedMembers } from '@/lib/portal/members'
import { listPlans } from '@/lib/portal/plans'
import { restoreMemberAction } from './actions'
import {
  MEMBER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from '@/lib/portal/labels'
import type { MemberStatus, PaymentStatus } from '@/types/database'
import { PageHeader } from '@/components/ui/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Table, THead, TH, TBody, TR, TD, EmptyRow } from '@/components/ui/Table'

export const dynamic = 'force-dynamic'

const field =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100'

function statusTone(s: MemberStatus): BadgeTone {
  return s === 'active' ? 'green' : s === 'pending' ? 'amber' : s === 'suspended' ? 'red' : 'slate'
}
function payTone(s: PaymentStatus): BadgeTone {
  return s === 'paid' ? 'green' : s === 'overdue' ? 'red' : 'slate'
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; plan_id?: string; view?: string; del?: string }>
}) {
  await requireFeature('members')
  const sp = await searchParams
  const showDeleted = sp.view === 'deleted'
  const [plans, deletedMembers] = await Promise.all([listPlans(), listDeletedMembers()])
  const members = showDeleted ? deletedMembers : await listMembers({ q: sp.q, status: sp.status, plan_id: sp.plan_id })

  return (
    <div>
      <PageHeader
        title="加盟店管理"
        description={showDeleted ? `削除済み ${members.length} 件（復元できます）` : `${members.length} 件の加盟店`}
        action={
          <ButtonLink href="/admin/members/new" size="sm">
            <Plus className="h-4 w-4" />
            加盟店を登録
          </ButtonLink>
        }
      />

      {sp.del === 'done' && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-700">
          会員登録を削除しました。削除済み一覧からいつでも復元できます。
        </div>
      )}

      <div className="mb-4 text-sm">
        {showDeleted ? (
          <Link href="/admin/members" className="text-brand-600 hover:underline">← 有効な加盟店に戻る</Link>
        ) : (
          deletedMembers.length > 0 && (
            <Link href="/admin/members?view=deleted" className="text-slate-500 hover:text-slate-800 hover:underline">
              削除済み（{deletedMembers.length}）を表示
            </Link>
          )
        )}
      </div>

      {/* フィルタバー（削除済み表示のときは非表示） */}
      {!showDeleted && (
      <form className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-card" action="/admin/members" method="get">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input name="q" defaultValue={sp.q ?? ''} placeholder="氏名・メール・会社名で検索" className={`${field} w-full pl-9`} />
        </div>
        <select name="status" defaultValue={sp.status ?? ''} className={field}>
          <option value="">すべてのステータス</option>
          {(Object.keys(MEMBER_STATUS_LABEL) as MemberStatus[]).map((s) => (
            <option key={s} value={s}>{MEMBER_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <select name="plan_id" defaultValue={sp.plan_id ?? ''} className={field}>
          <option value="">すべてのプラン</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
          絞り込む
        </button>
      </form>
      )}

      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>氏名 / 会社</TH>
            <TH>プラン</TH>
            <TH>ステータス</TH>
            <TH>支払</TH>
            <TH>{showDeleted ? '削除日 / 復元' : '最終ログイン'}</TH>
          </TR>
        </THead>
        <TBody>
          {members.length === 0 && <EmptyRow colSpan={5}>{showDeleted ? '削除済みの加盟店はありません。' : '条件に一致する加盟店がいません。'}</EmptyRow>}
          {members.map((mem) => (
            <TR key={mem.id}>
              <TD>
                <Link href={`/admin/members/${mem.id}`} className="flex items-center gap-3 group">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">
                    {(mem.company_name ?? mem.member_name).charAt(0)}
                  </span>
                  <span>
                    <span className="font-medium text-slate-900 group-hover:text-brand-600">{mem.company_name ?? mem.member_name}</span>
                    {mem.company_name && <span className="block text-xs text-slate-500">{mem.member_name}</span>}
                  </span>
                </Link>
              </TD>
              <TD>{mem.plan?.name ?? '—'}</TD>
              <TD><Badge tone={statusTone(mem.status)}>{MEMBER_STATUS_LABEL[mem.status]}</Badge></TD>
              <TD><Badge tone={payTone(mem.payment_status as PaymentStatus)}>{PAYMENT_STATUS_LABEL[mem.payment_status as PaymentStatus]}</Badge></TD>
              <TD className="text-slate-500">
                {showDeleted ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{mem.deleted_at ? new Date(mem.deleted_at).toLocaleDateString('ja-JP') : '—'}</span>
                    <form action={restoreMemberAction}>
                      <input type="hidden" name="id" value={mem.id} />
                      <button className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">復元</button>
                    </form>
                  </div>
                ) : (
                  mem.last_login_at ? new Date(mem.last_login_at).toLocaleDateString('ja-JP') : '—'
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  )
}
