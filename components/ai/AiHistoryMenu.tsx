'use client'

import { useState } from 'react'
import { History, Plus, Pin, PinOff, Trash2, Check } from 'lucide-react'

export type HistoryItem = { id: string; title: string | null; updatedAt: string; pinned: boolean }

/**
 * ⑰⑱ AI検索履歴のメニュー（残す・開く・消す・ピン留め・新規）。
 * ダーク（加盟者）/ライト（本部）両対応。データ取得と操作は親から渡す。
 */
export default function AiHistoryMenu({
  items,
  activeId,
  dark = false,
  onNew,
  onSelect,
  onPin,
  onDelete,
}: {
  items: HistoryItem[]
  activeId: string | null
  dark?: boolean
  onNew: () => void
  onSelect: (id: string) => void
  onPin: (id: string, pinned: boolean) => void
  onDelete: (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  const btn = dark
    ? 'border-carbon-600 text-slate-300 hover:bg-carbon-800'
    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
  const panel = dark ? 'border-carbon-700 bg-carbon-900' : 'border-slate-200 bg-white'
  const rowHover = dark ? 'hover:bg-carbon-800' : 'hover:bg-slate-50'
  const activeCls = dark ? 'bg-carbon-800 text-white' : 'bg-brand-50 text-brand-700'
  const sub = dark ? 'text-slate-500' : 'text-slate-400'

  const fmt = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${btn}`}
      >
        <History className="h-3.5 w-3.5" /> 履歴{items.length > 0 && `（${items.length}）`}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute right-0 z-20 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border shadow-lg ${panel}`}>
            <button
              type="button"
              onClick={() => { onNew(); setOpen(false) }}
              className={`flex w-full items-center gap-2 border-b px-3 py-2.5 text-sm font-medium ${dark ? 'border-carbon-700 text-brand-300' : 'border-slate-100 text-brand-600'} ${rowHover}`}
            >
              <Plus className="h-4 w-4" /> 新しい会話を始める
            </button>

            {items.length === 0 ? (
              <div className={`px-3 py-6 text-center text-xs ${sub}`}>保存された会話はまだありません。</div>
            ) : (
              <ul>
                {items.map((it) => (
                  <li key={it.id} className={`flex items-center gap-1 px-2 py-1.5 ${it.id === activeId ? activeCls : rowHover}`}>
                    <button
                      type="button"
                      onClick={() => { onSelect(it.id); setOpen(false) }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1">
                        {it.pinned && <Pin className="h-3 w-3 shrink-0 text-amber-400" />}
                        <span className="truncate text-xs font-medium">{it.title || '無題の会話'}</span>
                        {it.id === activeId && <Check className="h-3 w-3 shrink-0 opacity-70" />}
                      </div>
                      <div className={`text-[10px] ${sub}`}>{fmt(it.updatedAt)}</div>
                    </button>
                    <button
                      type="button"
                      title={it.pinned ? 'ピンを外す' : 'ピン留め'}
                      onClick={() => onPin(it.id, !it.pinned)}
                      className={`rounded p-1 ${sub} hover:text-amber-400`}
                    >
                      {it.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      title="削除"
                      onClick={() => { if (confirm('この会話を削除しますか？')) onDelete(it.id) }}
                      className={`rounded p-1 ${sub} hover:text-rose-400`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
