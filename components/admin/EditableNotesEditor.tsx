'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, Check, AlertTriangle, Eye } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { saveNoteAction } from '@/app/admin/notes/actions'

type Note = { key: string; label: string; where: string; title: string | null; body: string; updatedAt: string | null }

export default function EditableNotesEditor({ notes }: { notes: Note[] }) {
  return (
    <div className="space-y-4">
      {notes.map((n) => (
        <NoteCard key={n.key} note={n} />
      ))}
    </div>
  )
}

function NoteCard({ note }: { note: Note }) {
  const router = useRouter()
  const [title, setTitle] = useState(note.title ?? '')
  const [body, setBody] = useState(note.body)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = title !== (note.title ?? '') || body !== note.body

  const save = () => {
    setError(null)
    setSaved(false)
    start(async () => {
      const r = await saveNoteAction(note.key, title, body)
      if (!r.ok) { setError(r.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">{note.label}</div>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Eye className="h-3.5 w-3.5" /> {note.where}
          </div>
        </div>

        <label className="block text-sm">
          <span className="text-slate-600">見出し</span>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setSaved(false) }}
            placeholder="例）ご利用にあたって"
            className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
          />
        </label>

        <label className="block text-sm">
          <span className="text-slate-600">本文</span>
          <textarea
            value={body}
            onChange={(e) => { setBody(e.target.value); setSaved(false) }}
            rows={4}
            className="mt-1 w-full resize-y rounded-lg border border-slate-300 px-2.5 py-2 text-sm leading-relaxed focus:border-brand-400 focus:outline-none"
          />
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {note.updatedAt ? `最終更新：${new Date(note.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '未設定'}
          </span>
          <div className="flex items-center gap-2">
            {saved && !dirty && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" /> 保存しました</span>}
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存する
            </button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
