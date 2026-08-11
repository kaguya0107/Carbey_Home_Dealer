'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ArrowLeft, User, Building2, Mail, Phone, CheckCircle2, ChevronDown } from 'lucide-react'
import Wordmark from '@/components/Wordmark'

export default function RegisterPage() {
  const [form, setForm] = useState({ member_name: '', company_name: '', email: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          body.error === 'invalid_email'
            ? 'メールアドレスの形式が正しくありません。'
            : body.error === 'name_email_required'
              ? 'お名前とメールアドレスは必須です。'
              : '送信に失敗しました。時間をおいて再度お試しください。',
        )
      }
      setDone(true)
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
      {/* ===== 左: ブランドショーケース (ログイン画面と同じヒーロー画像 + ロゴオーバーレイ) ===== */}
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
      <div className="relative flex w-full items-center justify-center px-6 py-10 lg:w-1/2">
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
            <h2 className="text-xl font-bold text-slate-900">加盟のお申し込み</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              必要事項をご入力ください。本部にて確認後、ご登録用の招待メールをお送りします。
            </p>

            {done ? (
              <div className="mt-6 rounded-xl border border-green-100 bg-green-50 px-4 py-4 text-sm text-green-700">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
                  お申し込みを受け付けました
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed">
                  本部にて確認のうえ、ご登録用の招待メールをお送りします。今しばらくお待ちください。
                </p>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">{error}</div>
                )}
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">お名前 *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                      <input required value={form.member_name} onChange={set('member_name')} className={input} placeholder="山田 太郎" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">会社名</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                      <input value={form.company_name} onChange={set('company_name')} className={input} placeholder="株式会社カーベイ" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">メールアドレス *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                      <input type="email" required value={form.email} onChange={set('email')} className={input} placeholder="you@example.com" autoComplete="email" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-700">電話番号</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                      <input value={form.phone} onChange={set('phone')} className={input} placeholder="090-1234-5678" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="mt-1 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 disabled:opacity-60">
                    {loading ? '送信中...' : '申し込む'}
                  </button>
                </form>

                {/* お申し込みの流れ (コンパクト) */}
                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold text-slate-500">お申し込みの流れ</p>
                  <ol className="mt-2 space-y-1.5 text-[12px] text-slate-600">
                    <li className="flex gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-white">1</span>
                      このフォームから加盟申込
                    </li>
                    <li className="flex gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-semibold text-white">2</span>
                      本部が内容を確認・承認
                    </li>
                    <li className="flex gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-semibold text-white">3</span>
                      招待メールから初回パスワード設定 → 利用開始
                    </li>
                  </ol>
                </div>
              </>
            )}

            <a href="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
              <ArrowLeft className="h-4 w-4" />
              ログインページに戻る
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
