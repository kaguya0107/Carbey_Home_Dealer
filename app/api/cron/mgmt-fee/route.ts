import { NextResponse, type NextRequest } from 'next/server'
import { runAutoMgmtFees } from '@/lib/portal/mgmt-fee'

export const dynamic = 'force-dynamic'

/**
 * #33 月額管理手数料の自動引き落とし（cron 用エンドポイント）。
 * スケジューラ（Vercel Cron / Supabase pg_cron / 外部）から、毎日この URL を叩く想定：
 *   Authorization: Bearer <CRON_SECRET>   もしくは  ?secret=<CRON_SECRET>
 * mgmt_fee_auto=true の加盟者だけを対象に、満了月が来た分を自動課金する
 * （二重課金は mgmt_fee_billed_months で防止されるため、毎日呼んでも安全）。
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  const provided = header.replace(/^Bearer\s+/i, '') || request.nextUrl.searchParams.get('secret') || ''
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const results = await runAutoMgmtFees(null)
  const charged = results.filter((r) => r.charged)
  const totalYen = charged.reduce((s, r) => s + r.gross, 0)
  return NextResponse.json({ ok: true, targets: results.length, charged: charged.length, totalYen })
}
