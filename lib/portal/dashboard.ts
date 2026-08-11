import { createServiceRoleClient } from '@/lib/supabase/admin'

export type AdminStats = {
  members: { total: number; active: number; pending: number; suspended: number; cancelled: number }
  planDistribution: { code: string; name: string; count: number }[]
  monthlyRevenueYen: number
  newOrders: number
  unreadChats: number
  orderStatus: { received: number; in_progress: number; completed: number; cancelled: number }
}

/** 本部ダッシュボードの集計。実データのみ（未実装の売上/AI等は扱わない）。 */
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = createServiceRoleClient()

  const [membersRes, plansRes, paymentsRes, ordersRes, unreadRes] = await Promise.all([
    supabase.from('members').select('status, plan_id').is('deleted_at', null),
    supabase.from('plans').select('id, code, name, display_order').order('display_order'),
    supabase.from('payments').select('amount_yen, payment_date, status'),
    supabase.from('orders').select('status'),
    // 本部宛（加盟店発）未読メッセージ総数
    supabase.from('chat_messages').select('id', { count: 'exact', head: true }).eq('sender_role', 'member').is('read_at', null),
  ])

  const m = (membersRes.data ?? []) as { status: string; plan_id: string | null }[]
  const plans = (plansRes.data ?? []) as { id: string; code: string; name: string }[]
  const payments = (paymentsRes.data ?? []) as { amount_yen: number; payment_date: string; status: string }[]
  const orders = (ordersRes.data ?? []) as { status: string }[]

  const counts = {
    total: m.length,
    active: m.filter((x) => x.status === 'active').length,
    pending: m.filter((x) => x.status === 'pending').length,
    suspended: m.filter((x) => x.status === 'suspended').length,
    cancelled: m.filter((x) => x.status === 'cancelled').length,
  }

  const planDistribution = plans.map((p) => ({
    code: p.code,
    name: p.name,
    count: m.filter((x) => x.plan_id === p.id).length,
  }))

  // 今月の確定入金合計
  const now = new Date()
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthlyRevenueYen = payments
    .filter((p) => p.status === 'confirmed' && String(p.payment_date).startsWith(ym))
    .reduce((s, p) => s + (p.amount_yen ?? 0), 0)

  const orderStatus = {
    received: orders.filter((o) => o.status === 'received').length,
    in_progress: orders.filter((o) => o.status === 'in_progress').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  }

  return {
    members: counts,
    planDistribution,
    monthlyRevenueYen,
    newOrders: orderStatus.received,
    unreadChats: unreadRes.count ?? 0,
    orderStatus,
  }
}

export type RecentMember = {
  id: string
  member_name: string
  company_name: string | null
  status: string
  created_at: string
}

/** 最近登録された加盟店 (ダッシュボードの最近の動き)。 */
export async function getRecentMembers(limit = 5): Promise<RecentMember[]> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('members')
    .select('id, member_name, company_name, status, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as RecentMember[]
}
