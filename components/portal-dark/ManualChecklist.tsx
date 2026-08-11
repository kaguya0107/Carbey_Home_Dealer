'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, ChevronDown, Loader2, FileText, Download, PlayCircle } from 'lucide-react'
import { toggleManualAction } from '@/app/portal/onboarding/manual/actions'
import type { ManualSectionWithCheck } from '@/lib/portal/manual'

/** 動画URL → 埋め込み再生用URL（YouTube/Vimeo）。対応外は null。 */
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1)
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id) return `https://player.vimeo.com/video/${id}`
    }
  } catch {
    return null
  }
  return null
}

/** 実践マニュアル チェックリスト（項目を開いて内容確認→チェック）。 */
export default function ManualChecklist({ sections }: { sections: ManualSectionWithCheck[] }) {
  return (
    <ul className="space-y-2">
      {sections.map((s, i) => (
        <SectionRow key={s.id} section={s} index={i} />
      ))}
    </ul>
  )
}

function SectionRow({ section, index }: { section: ManualSectionWithCheck; index: number }) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(section.checked)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  const toggle = () => {
    const next = !checked
    setChecked(next) // 楽観
    setError('')
    start(async () => {
      const r = await toggleManualAction(section.id, next)
      if (!r.ok) { setChecked(!next); setError(r.error ?? '') }
    })
  }

  return (
    <li className="rounded-xl border border-carbon-700 bg-carbon-800/40">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={toggle} disabled={pending} className="shrink-0" aria-label="チェック">
          {pending ? <Loader2 className="h-5 w-5 animate-spin text-brand-400" /> : checked ? <CheckCircle2 className="h-5 w-5 text-brand-400" /> : <Circle className="h-5 w-5 text-slate-600" />}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="text-[11px] font-semibold text-slate-500">{index + 1}.</span>
          <span className={`text-sm font-medium ${checked ? 'text-slate-400' : 'text-slate-100'}`}>{section.title}</span>
          <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="border-t border-carbon-700 px-4 py-3 space-y-3">
          {/* ㉜ 動画（埋め込み再生） */}
          {section.video_url && (() => {
            const embed = toEmbedUrl(section.video_url!)
            return embed ? (
              <div className="aspect-video overflow-hidden rounded-lg border border-carbon-700">
                <iframe src={embed} title={section.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            ) : (
              <a href={section.video_url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:underline">
                <PlayCircle className="h-4 w-4" /> 動画を見る
              </a>
            )
          })()}

          {/* 本文 */}
          {section.body ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{section.body}</p>
          ) : !section.video_url && !section.attachment_url ? (
            <p className="text-xs italic text-slate-500">この項目の内容は準備中です。</p>
          ) : null}

          {/* ㉜ 添付ファイル（ダウンロード） */}
          {section.attachment_url && (
            <a href={section.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-carbon-600 bg-carbon-800/60 px-3 py-2 text-xs text-slate-200 hover:bg-carbon-800">
              <FileText className="h-4 w-4 text-brand-400" />
              <span className="flex-1">{section.attachment_name ?? '添付資料'}</span>
              <Download className="h-3.5 w-3.5 text-slate-400" />
            </a>
          )}

          {!checked && (
            <button onClick={toggle} disabled={pending} className="mt-1 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              確認しました（チェック）
            </button>
          )}
        </div>
      )}
      {error && <div className="px-4 pb-2 text-[11px] text-rose-400">{error}</div>}
    </li>
  )
}
