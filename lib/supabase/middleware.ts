import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getPublicSupabaseConfig } from '@/lib/env'

/** Supabase セッションを毎リクエストでリフレッシュする。 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } })

  const { url, anonKey } = getPublicSupabaseConfig()

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options })
        response = NextResponse.next({ request: { headers: request.headers } })
        response.cookies.set({ name, value: '', ...options })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 未認証で保護領域にアクセスしたらログインへ
  const path = request.nextUrl.pathname
  const isProtected = path.startsWith('/admin') || path.startsWith('/portal')
  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', path)
    return NextResponse.redirect(loginUrl)
  }

  return response
}
