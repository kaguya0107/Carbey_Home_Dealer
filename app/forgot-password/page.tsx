'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, Mail, Send, ShieldCheck, Clock, Lock } from 'lucide-react'
import Wordmark from '@/components/Wordmark'
import AuthStepper from '@/components/auth/AuthStepper'

const STEPS = [{ label: 'メール送信' }, { label: 'メール確認' }, { label: '完了' }]

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          body.error === 'SMTP not configured'
            ? 'メール送信が未設定です。本部にお問い合わせください。'
            : '送信に失敗しました',
        )
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const input =
    'w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100'

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ===== 左: フォーム (白カード) ===== */}
      <div className="relative flex w-full items-center justify-center px-6 py-10 lg:w-1/2">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-card sm:p-10">
          <Wordmark size="md" />

          <div className="mt-8">
            <AuthStepper steps={STEPS} current={sent ? 1 : 0} />
          </div>

          <h1 className="mt-8 text-2xl font-bold text-slate-900">パスワードをリセットします</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            ご登録のメールアドレスを入力してください。
            <br />
            パスワードリセット用のリンクをお送りします。
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
              {email} にリセットリンクを送信しました。メールをご確認ください。
            </div>
          ) : (
            <>
              {error && (
                <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
              )}
              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-slate-700">メールアドレス</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                    <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="メールアドレスを入力してください" autoComplete="email" />
                  </div>
                </div>
                <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60">
                  <Send className="h-4 w-4" />
                  {loading ? '送信中...' : 'リセット用リンクを送信'}
                </button>
              </form>
            </>
          )}

          <a href="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-info-600 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            ログインページに戻る
          </a>

          {/* 安心ノート */}
          <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ShieldCheck className="h-4 w-4 text-info-600" />
              ご安心ください
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              ご入力いただいたメールアドレスが他の人に公開されることはありません。安全にパスワードをリセットできます。
            </p>
          </div>
        </div>
      </div>

      {/* ===== 右: イラスト + 特徴3点 ===== */}
      <div className="relative hidden w-1/2 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-info-50 via-slate-50 to-white px-10 lg:flex">
        <Image src="/forgot_PW.png" alt="" width={240} height={240} priority className="h-60 w-60 object-contain" />
        <h2 className="mt-8 text-2xl font-bold text-slate-900">メールをご確認ください</h2>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-slate-500">
          パスワードリセット用のリンクをご登録のメールアドレスに送信しました。
          メール内のリンクをクリックして、新しいパスワードを設定してください。
        </p>

        <div className="mt-10 grid max-w-md grid-cols-3 gap-4">
          <Feature icon={<ShieldCheck className="h-5 w-5" />} title="安全なリセット" desc="有効期限付きリンクで安全にリセットできます" />
          <Feature icon={<Clock className="h-5 w-5" />} title="有効期限は60分" desc="リンクの有効期限は60分間です" />
          <Feature icon={<Lock className="h-5 w-5" />} title="安心のセキュリティ" desc="お客様の情報は安全に保護されています" />
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-info-100 text-info-600">{icon}</div>
      <p className="mt-2 text-[13px] font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{desc}</p>
    </div>
  )
}
