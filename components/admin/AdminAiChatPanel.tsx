'use client'

import { useRef, useState } from 'react'
import { Send, Sparkles, Database, Loader2 } from 'lucide-react'
import AiHistoryMenu, { type HistoryItem } from '@/components/ai/AiHistoryMenu'
import {
  listHqConversationsAction,
  loadHqConversationAction,
  deleteHqConversationAction,
  pinHqConversationAction,
} from '@/app/admin/ai/actions'

type Evidence = { function: string; result_count: number; snapshot_date: string; summary?: string }
type Msg = { role: 'user' | 'assistant'; text: string; evidence?: Evidence[] }

const ERR: Record<string, string> = {
  ai_not_configured: 'AIが未設定です（APIキー未設定）。',
  ai_config_error: 'AIの設定に問題があるようです（APIキーの確認が必要です）。',
  ai_error: 'AIの応答でエラーが発生しました。もう一度お試しください。',
  forbidden: 'この会話にはアクセスできません。',
}

// 本部（社内オペレーション）向けの入口。クレーム対応を先頭に、スタッフ実務の入口として提示する。
const DIRECTIONS: { label: string; example: string }[] = [
  { label: 'クレーム対応', example: '「納車後に不具合が見つかった、返品したい」というお客様のクレームに、規約に沿ってできる/できないを整理し、回答案を作って' },
  { label: '対応文の下書き', example: '値下げ交渉の問い合わせに、丁寧に断りつつ代案を示す返信文案を作って' },
  { label: '市場分析・壁打ち', example: '今の中古車市場の概況と、軽の在庫を増やすべきか壁打ちしたい' },
]

export default function AdminAiChatPanel({
  initialConversations = [],
  initialConversationId = null,
  initialMessages = [],
}: {
  initialConversations?: HistoryItem[]
  initialConversationId?: string | null
  initialMessages?: Msg[]
} = {}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId)
  const [conversations, setConversations] = useState<HistoryItem[]>(initialConversations)
  const listRef = useRef<HTMLDivElement>(null)

  const scrollDown = () => requestAnimationFrame(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  })

  const refreshList = () => listHqConversationsAction().then(setConversations).catch(() => {})

  async function selectConversation(id: string) {
    if (id === conversationId || loading) return
    setLoading(true)
    const r = await loadHqConversationAction(id)
    setLoading(false)
    if (r.ok && r.messages) { setMessages(r.messages as Msg[]); setConversationId(id); scrollDown() }
  }
  function newChat() { setMessages([]); setConversationId(null); setInput('') }
  async function pinConversation(id: string, pinned: boolean) {
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, pinned } : c)))
    await pinHqConversationAction(id, pinned); refreshList()
  }
  async function removeConversation(id: string) {
    setConversations((cs) => cs.filter((c) => c.id !== id))
    if (id === conversationId) newChat()
    await deleteHqConversationAction(id); refreshList()
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim()
    if (!text || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setLoading(true)
    scrollDown()
    try {
      const res = await fetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', text: ERR[data.error] ?? 'エラーが発生しました。' }])
      } else {
        if (data.conversationId) setConversationId(data.conversationId)
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

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Sparkles className="h-4 w-4 text-brand-500" /> 本部AI（クレーム対応・分析・壁打ち）
        </span>
        <AiHistoryMenu
          items={conversations}
          activeId={conversationId}
          onNew={newChat}
          onSelect={selectConversation}
          onPin={pinConversation}
          onDelete={removeConversation}
        />
      </div>

      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto mt-6 max-w-lg text-center">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-brand-400/70" />
            <p className="text-sm font-medium text-slate-600">本部スタッフ向けの社内アシスタントです</p>
            <p className="mt-1 text-xs text-slate-400">
              規約・料金表に沿ったクレーム対応の可否判断を軸に、対応文の下書き・市場分析・経営相談まで幅広く相談できます。
              まずは例文から始められます。
            </p>
            <div className="mt-4 grid gap-2 text-left sm:grid-cols-3">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => send(d.example)}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                >
                  <div className="text-sm font-semibold text-slate-700">{d.label}</div>
                  <div className="mt-1 text-xs text-slate-400">{d.example}</div>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                m.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-500 px-4 py-2.5 text-sm text-white'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700'
              }
            >
              {m.text}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {m.evidence.map((e, j) => (
                    <span key={j} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
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
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-brand-500" /> 分析中…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder="分析・対応文の下書き・経営相談など、なんでも相談…（Shift+Enter で改行）"
            disabled={loading}
            className="max-h-32 flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20 disabled:opacity-50"
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-brand-500 text-white transition hover:bg-brand-600 disabled:opacity-40"
            aria-label="送信"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
