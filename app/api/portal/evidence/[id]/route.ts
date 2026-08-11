import { NextResponse, type NextRequest } from 'next/server'
import { getSessionUser, isStaff } from '@/lib/auth/session'
import { getEvidenceForViewer } from '@/lib/portal/evidence'

/**
 * エビデンス（本人確認・古物商）のプレビュー/ダウンロード。
 * サーバーが権限（本部 or 本人）を確認し、実体をそのまま返す（署名URLを露出しない）。
 *   GET /api/portal/evidence/<id>            → プレビュー
 *   GET /api/portal/evidence/<id>?download=1 → ダウンロード
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return new NextResponse('unauthorized', { status: 401 })

  const { id } = await params
  const download = request.nextUrl.searchParams.get('download') === '1'

  const file = await getEvidenceForViewer(id, { userId: session.userId, isStaff: isStaff(session.role) })
  if (!file) return new NextResponse('not found', { status: 404 })

  const buffer = Buffer.from(await file.data.arrayBuffer())
  const encodedName = encodeURIComponent(file.name)
  const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodedName}`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': file.type,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, no-store',
    },
  })
}
