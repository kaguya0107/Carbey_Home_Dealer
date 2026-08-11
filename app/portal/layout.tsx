import { requireMember } from '@/lib/auth/session'
import { getMemberByUserId } from '@/lib/portal/members'
import { unreadUserCount } from '@/lib/portal/notifications'
import { MEMBER_STATUS_LABEL } from '@/lib/portal/labels'
import PortalSidebar, { type PortalNavEntry } from '@/components/portal-dark/PortalSidebar'
import PortalTopbar from '@/components/portal-dark/PortalTopbar'
import type { MemberStatus } from '@/types/database'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMember()
  const [member, unread] = await Promise.all([
    getMemberByUserId(session.userId),
    unreadUserCount(session.userId),
  ])

  // カンプ準拠のナビ。Phase 3/4 の未実装は soon。
  const nav: PortalNavEntry[] = [
    { href: '/portal/onboarding', label: 'オンボーディング', icon: 'onboarding' },
    { href: '/portal/dashboard', label: 'ダッシュボード', icon: 'dashboard' },
    { href: '/portal/vehicles', label: '車両管理', icon: 'vehicle', soon: true },
    // 自動売買（フェーズ8）：権限を持つ加盟者のみ表示
    ...(member?.grant_auto ? [{ href: '/portal/auto', label: '自動売買', icon: 'auto' as const }] : []),
    // 半自動売買（旧「オーダー管理」・仕入れオーダー）。自動売買の下に配置（レビュー⑭）
    { href: '/portal/orders', label: '半自動売買', icon: 'order' },
    { href: '/portal/training', label: 'トレーニング', icon: 'training' },
    // AI分析・相場：プランで feature_ai が有効なときのみ表示（#18）
    ...(member?.plan?.feature_ai ? [{ href: '/portal/ai', label: 'AI分析・相場', icon: 'ai' as const }] : []),
    // CRM（顧客管理）：プランで feature_crm が有効なときのみ表示（#18/#19）
    ...(member?.plan?.feature_crm ? [{ href: '/portal/crm', label: 'CRM（顧客管理）', icon: 'crm' as const }] : []),
    { href: '/portal/withdrawal', label: '出金申請', icon: 'withdrawal' },
    { href: '/portal/reports', label: 'レポート', icon: 'report' },
    { href: '/portal/chat', label: 'チャット', icon: 'chat' },
    { href: '/portal/announcements', label: 'お知らせ', icon: 'announce', badge: unread },
    { href: '/portal/terms', label: '利用規約', icon: 'terms' },
    { href: '/portal/profile', label: '設定', icon: 'settings' },
  ]

  // 拡張オプション（今後の拡張予定・レビュー⑨）。非クリックの状態バッジ表示。
  const expansion: PortalNavEntry[] = [
    // #25 仕入れオーダー数の拡張（加盟店ごとに本部が個別拡張・要相談）
    { href: '#', label: '仕入れオーダー拡張', icon: 'order', tag: { text: '相談', tone: 'sky' } },
    { href: '#', label: 'プラン変更', icon: 'plan_change', tag: { text: '提供予定', tone: 'sky' } },
    { href: '#', label: 'フルオート輸出', icon: 'export', tag: { text: '開発中', tone: 'amber' } },
    { href: '#', label: '代理店申請', icon: 'agency', tag: { text: '開発中', tone: 'amber' } },
    { href: '#', label: 'マッチングオーダー', icon: 'matching', tag: { text: '開発中', tone: 'amber' } },
  ]

  const plan = {
    name: member?.plan?.name ?? '未設定',
    status: member ? MEMBER_STATUS_LABEL[member.status as MemberStatus] : '—',
    contractFrom: member?.contract_date ?? member?.registration_date ?? null,
  }

  // 加盟店ID表示（member.id から短縮コード）
  const memberCode = member ? `HD-${member.id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : '—'

  return (
    <div className="hud-grid min-h-screen bg-carbon-950 text-slate-200 on-dark">
      <PortalSidebar nav={nav} plan={plan} expansion={expansion} />
      <div className="lg:pl-64">
        <PortalTopbar
          userName={member?.company_name ?? member?.member_name ?? session.name ?? session.email ?? 'ユーザー'}
          memberCode={memberCode}
          userId={session.userId}
          unread={unread}
        />
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
