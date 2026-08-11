'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Lock, Mail, ChevronDown, ShieldCheck, HelpCircle } from 'lucide-react'
import Wordmark from '@/components/Wordmark'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const params = useSearchParams()

  const initialError =
    params.get('error') === 'forbidden' ? 'この画面へのアクセス権限がありません。' : ''

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const redirect = params.get('redirect')
      router.push(redirect ? `/post-login?redirect=${encodeURIComponent(redirect)}` : '/post-login')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const input =
    'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ===== 左: ブランドショーケース (ヒーロー画像 + ロゴオーバーレイ) ===== */}
      <div className="relative hidden w-1/2 overflow-hidden bg-navy-900 lg:block">
        <Image
          src="/login-hero.png"
          alt="CARBAY Home Dealer — データとAIで、中古車ビジネスを次のステージへ。"
          fill
          priority
          sizes="50vw"
          className="object-cover object-left"
        />
      </div>

      {/* ===== 右: フォーム ===== */}
      <div className="relative flex w-full flex-col items-center justify-center px-6 pb-16 pt-12 lg:w-1/2">
        {/* 言語切替 */}
        <div className="absolute right-6 top-6 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500">
          <span>🌐</span>
          <span>日本語</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </div>

        <div className="w-full max-w-md">
          {/* モバイル用ロゴ */}
          <div className="mb-8 lg:hidden">
            <Wordmark size="md" />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-card sm:p-9">
            <h2 className="text-2xl font-bold text-slate-900">ログイン</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              アカウントにログインして
              <br />
              プラットフォームを利用しましょう。
            </p>

            {(error || initialError) && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
                {error || initialError}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">メールアドレス</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="メールアドレスを入力してください" autoComplete="email" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700">パスワード</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                  <input type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="パスワードを入力してください" autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={showPw ? '隠す' : '表示'}>
                    {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
                <div className="mt-2 text-right">
                  <a href="/forgot-password" className="text-[13px] font-medium text-info-600 hover:underline">パスワードをお忘れの方</a>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-slate-600">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
                ログインしたままにする
              </label>

              <button type="submit" disabled={loading} className="mt-1 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60">
                {loading ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>

            {/* 区切り */}
            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">または</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Google (招待制のため案内) */}
            <button
              type="button"
              onClick={() => setError('Googleログインは現在準備中です。本部発行のメール・パスワードでログインしてください。')}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <GoogleIcon />
              Googleでログイン
            </button>

            <p className="mt-5 text-center text-[13px] text-slate-500">
              アカウントをお持ちでない方は{' '}
              <a href="/register" className="font-medium text-info-600 hover:underline">こちら</a>
            </p>
          </div>
        </div>

        {/* 信頼バッジ (右パネル最下部・横一列。カンプ準拠) */}
        <div className="absolute inset-x-0 bottom-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 px-6 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Lock className="h-3.5 w-3.5" />
            SSLで安全に保護されています
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <ShieldCheck className="h-3.5 w-3.5" />
            24時間365日監視体制
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <HelpCircle className="h-3.5 w-3.5" />
            サポートセンター
          </span>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
