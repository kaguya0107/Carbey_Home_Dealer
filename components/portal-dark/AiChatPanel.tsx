'use client'

import { useRef, useState } from 'react'
import { Send, Sparkles, Database, Loader2, ImagePlus, Zap, FileSpreadsheet, X } from 'lucide-react'
import AiHistoryMenu, { type HistoryItem } from '@/components/ai/AiHistoryMenu'
import {
  listAiConversationsAction,
  loadAiConversationAction,
  deleteAiConversationAction,
  pinAiConversationAction,
} from '@/app/portal/ai/actions'

type Evidence = { function: string; result_count: number; snapshot_date: string; summary?: string }
type Msg = { role: 'user' | 'assistant'; text: string; evidence?: Evidence[] }
type ImageAttach = { media_type: string; data: string; name: string }
export type Expansions = { image: boolean; deep: boolean; docgen: boolean }

const ERR: Record<string, string> = {
  quota_exceeded: '今月の検索回数を使い切りました。翌月に繰り越し・追加でご利用いただけます。',
  ai_not_configured: 'AIが未設定です。本部にお問い合わせください。',
  ai_config_error: 'AIの設定に問題があるようです。本部にお問い合わせください。',
  ai_error: 'AIの応答でエラーが発生しました。もう一度お試しください。',
  expansion_disabled: 'この機能は現在のプランで無効です。本部にお問い合わせください。',
  forbidden: 'この会話にはアクセスできません。',
}

export default function AiChatPanel({
  initialRemaining,
  allocated,
  expansions,
  initialConversations = [],
  initialConversationId = null,
  initialMessages = [],
}: {
  initialRemaining: number | null
  allocated: number | null
  expansions: Expansions
  initialConversations?: HistoryItem[]
  initialConversationId?: string | null
  initialMessages?: Msg[]
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(initialRemaining)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [conversations, setConversations] = useState<HistoryItem[]>(initialConversations)
  const [deep, setDeep] = useState(false)
  const [image, setImage] = useState<ImageAttach | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refreshList = () => listAiConversationsAction().then(setConversations).catch(() => {})

  async function selectConversation(id: string) {
    if (id === conversationId || loading) return
    setLoading(true)
    const r = await loadAiConversationAction(id)
    setLoading(false)
    if (r.ok && r.messages) {
      setMessages(r.messages as Msg[])
      setConversationId(id)
      scrollDown()
    }
  }
  function newChat() {
    setMessages([])
    setConversationId(null)
    setInput('')
    setImage(null)
  }
  async function pinConversation(id: string, pinned: boolean) {
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, pinned } : c)))
    await pinAiConversationAction(id, pinned)
    refreshList()
  }
  async function deleteConversation(id: string) {
    setConversations((cs) => cs.filter((c) => c.id !== id))
    if (id === conversationId) newChat()
    await deleteAiConversationAction(id)
    refreshList()
  }

  const scrollDown = () => requestAnimationFrame(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  })

  function readImageFile(f: File, fallbackName = '画像') {
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result)
      setImage({ media_type: f.type, data: res.slice(res.indexOf(',') + 1), name: f.name || fallbackName })
    }
    reader.readAsDataURL(f)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) readImageFile(f)
    e.target.value = ''
  }

  // ⑲ クリップボードからの貼り付け（スクショ）。画像機能が有効なときのみ取り込む。
  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (!expansions.image) return
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith('image/'))
    if (!item) return
    const f = item.getAsFile()
    if (f) {
      e.preventDefault()
      readImageFile(f, 'スクリーンショット.png')
    }
  }

  async function submit(mode: 'normal' | 'deep' | 'docgen') {
    const text = input.trim()
    if ((!text && !image) || loading) return
    const userLabel = image ? `${text || '（画像）'} 🖼${image.name}` : text
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: userLabel }])
    setLoading(true)
    scrollDown()
    const payload: Record<string, unknown> = { conversationId, message: text }
    if (image) payload.image = { media_type: image.media_type, data: image.data }
    else if (mode === 'deep') payload.mode = 'deep'
    else if (mode === 'docgen') payload.mode = 'docgen'
    setImage(null)
    try {
      const res = await fetch('/api/portal/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', text: ERR[data.error] ?? 'エラーが発生しました。' }])
      } else {
        if (data.conversationId) setConversationId(data.conversationId)
        if (data.remaining !== undefined) setRemaining(data.remaining)
        setMessages((m) => [...m, { role: 'assistant', text: data.text, evidence: data.evidence }])
        refreshList() // ⑰ 新規会話を履歴一覧へ反映
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', text: '通信エラーが発生しました。' }])
    } finally {
      setLoading(false)
      scrollDown()
    }
  }

  const blocked = remaining === 0 && !image && !deep
  const chip = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition'

  return (
    <div className="flex h-[calc(100vh-14rem)] flex-col overflow-hidden rounded-xl border border-carbon-700 bg-carbon-850/80">
      <div className="flex items-center justify-between border-b border-carbon-700 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Sparkles className="h-4 w-4 text-brand-400" /> カーベイAI
        </span>
        <div className="flex items-center gap-2">
          {remaining !== null && (
            <span className="rounded-full border border-carbon-600 bg-carbon-900 px-3 py-1 text-xs text-slate-300">
              今月の残り検索：<span className="font-semibold text-brand-400">{remaining}</span>
              {allocated !== null && <span className="text-slate-500"> / {allocated}</span>} 回
            </span>
          )}
          <AiHistoryMenu
            items={conversations}
            activeId={conversationId}
            dark
            onNew={newChat}
            onSelect={selectConversation}
            onPin={pinConversation}
            onDelete={deleteConversation}
          />
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-slate-500">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-brand-500/60" />
            相場・仕入れ・経営に加え、システムの使い方や、規約・料金に基づく対応可否も相談できます。<br />
            例：「プリウス30後期の相場は？」「出金申請はどこからする？」「返品はできますか？（規約で確認して）」
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-500/90 px-4 py-2.5 text-sm text-white'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-carbon-700 bg-carbon-900 px-4 py-2.5 text-sm text-slate-200'
              }
            >
              {m.text}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-carbon-700 pt-2">
                  {m.evidence.map((e, j) => (
                    <span key={j} className="inline-flex items-center gap-1 rounded-full bg-carbon-800 px-2 py-0.5 text-[11px] text-slate-400">
                      <Database className="h-3 w-3" /> {e.result_count}件 · {e.snapshot_date}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-carbon-700 bg-carbon-900 px-4 py-2.5 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-brand-400" /> {deep ? '詳しく分析中…' : '分析中…'}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-carbon-700 p-3">
        {/* 任意拡張の操作（有効な機能のみ表示） */}
        {(expansions.deep || expansions.image || expansions.docgen || image) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {expansions.deep && (
              <button
                onClick={() => setDeep((v) => !v)}
                className={`${chip} ${deep ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-carbon-600 text-slate-400 hover:text-slate-200'}`}
              >
                <Zap className="h-3.5 w-3.5" /> 詳しく分析{deep ? '（ON）' : ''}
              </button>
            )}
            {expansions.image && (
              <>
                <button onClick={() => fileRef.current?.click()} className={`${chip} border-carbon-600 text-slate-400 hover:text-slate-200`}>
                  <ImagePlus className="h-3.5 w-3.5" /> 画像を添付
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="hidden" />
              </>
            )}
            {expansions.docgen && (
              <button onClick={() => submit('docgen')} disabled={loading || !input.trim()} className={`${chip} border-carbon-600 text-slate-400 hover:text-slate-200 disabled:opacity-40`}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> 書面で作成
              </button>
            )}
            {image && (
              <span className="inline-flex items-center gap-1 rounded-full bg-carbon-800 px-2.5 py-1 text-xs text-slate-300">
                🖼 {image.name}
                <button onClick={() => setImage(null)} className="text-slate-500 hover:text-rose-400"><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(deep ? 'deep' : 'normal')
              }
            }}
            onPaste={onPaste}
            rows={1}
            placeholder={expansions.image ? '相場・使い方・対応可否など…（画像は貼り付け／添付で相場検索）' : '相場・使い方・対応可否・経営について質問…（Shift+Enter で改行）'}
            disabled={loading || blocked}
            className="max-h-32 flex-1 resize-none rounded-lg border border-carbon-600 bg-carbon-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
          />
          <button
            onClick={() => submit(deep ? 'deep' : 'normal')}
            disabled={loading || (!input.trim() && !image) || blocked}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40"
            aria-label="送信"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        {blocked && (
          <p className="mt-1.5 text-xs text-amber-400">今月の検索回数を使い切りました。翌月への繰り越し／追加でご利用いただけます。</p>
        )}
      </div>
    </div>
  )
}
