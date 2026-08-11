import { NextResponse, type NextRequest } from 'next/server'
import { createAuthClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createAuthClient()
  await supabase.auth.signOut()
  // 303 See Other: POST 後に GET /login へ遷移させる
  // (既定の 307 だと POST メソッドが維持され、GET 専用の /login で 405 になる)
  return NextResponse.redirect(new URL('/login', request.nextUrl.origin), { status: 303 })
}
