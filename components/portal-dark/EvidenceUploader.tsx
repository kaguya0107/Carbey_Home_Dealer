'use client'

import { useRef, useState, useTransition } from 'react'
import { UploadCloud, FileText, Eye, Download, Trash2, CheckCircle2, Clock, XCircle, Loader2, RotateCcw } from 'lucide-react'
import { uploadEvidenceAction, deleteEvidenceAction } from '@/app/portal/onboarding/evidence/actions'
import type { EvidenceRow, EvidenceKind, EvidenceDocType } from '@/types/database'

const DOC_LABEL: Record<string, string> = {
  license: '運転免許証', mynumber: 'マイナンバーカード', passport: 'パスポート', antique: '古物商許可証', other: 'その他',
}
const STATUS: Record<EvidenceRow['status'], { label: string; cls: string; icon: typeof Clock }> = {
  pending: { label: '確認待ち', cls: 'bg-amber-500/15 text-amber-400', icon: Clock },
  approved: { label: '承認済み', cls: 'bg-brand-500/15 text-brand-400', icon: CheckCircle2 },
  rejected: { label: '却下', cls: 'bg-rose-500/15 text-rose-400', icon: XCircle },
}

function fmtSize(b: number | null) {
  if (b == null) return ''
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

/**
 * エビデンス提出ボックス（本人確認 or 古物商）。
 * ドラッグ&ドロップ or ファイル選択でアップロード。一覧・プレビュー・DL・削除（未確認のみ）。
 */
export default function EvidenceUploader({
  kind,
  items,
  identityDocType, // identity のときの身分証種別（外部select と連動）
}: {
  kind: EvidenceKind
  items: EvidenceRow[]
  identityDocType?: EvidenceDocType
}) {
  const [dragOver, setDragOver] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState<EvidenceDocType>(identityDocType ?? 'license')

  const submit = (file: File) => {
    setError('')
    if (kind === 'identity' && !['license', 'mynumber', 'passport'].includes(docType)) {
      setError('身分証の種類を選択してください')
      return
    }
    const fd = new FormData()
    fd.set('kind', kind)
    if (kind === 'identity') fd.set('doc_type', docType)
    fd.set('file', file)
    start(async () => {
      const res = await uploadEvidenceAction(fd)
      if (!res.ok) setError(res.error ?? 'アップロードに失敗しました')
    })
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) submit(f)
  }

  // 承認済みが1件でもあれば「提出完了」。却下のみ（承認/確認待ちが無い）なら再提出を促す。
  const hasApproved = items.some((e) => e.status === 'approved')
  const hasPending = items.some((e) => e.status === 'pending')
  const needsResubmit = !hasApproved && !hasPending && items.some((e) => e.status === 'rejected')

  return (
    <div className="space-y-3">
      {/* 却下 → 再提出のご案内（承認・確認待ちが無いとき） */}
      {needsResubmit && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-xs">
          <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <span className="text-rose-200">
            提出書類が<span className="font-semibold">却下</span>されました。下記の却下理由をご確認のうえ、
            <span className="font-semibold text-rose-100">もう一度アップロード</span>してください。
          </span>
        </div>
      )}

      {/* 身分証種別（本人確認のみ） */}
      {kind === 'identity' && (
        <div className="flex flex-wrap gap-2">
          {(['license', 'mynumber', 'passport'] as EvidenceDocType[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDocType(d)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                docType === d ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-carbon-600 text-slate-400 hover:bg-white/5'
              }`}
            >
              {DOC_LABEL[d]}
            </button>
          ))}
        </div>
      )}

      {/* D&D ゾーン */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          dragOver ? 'border-brand-500 bg-brand-500/10' : 'border-carbon-600 bg-carbon-800/40 hover:bg-carbon-800'
        }`}
      >
        {pending ? (
          <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
        ) : (
          <UploadCloud className="h-7 w-7 text-slate-500" />
        )}
        <p className="text-sm text-slate-300">
          ファイルをここに<span className="font-semibold text-brand-400">ドラッグ&ドロップ</span>
        </p>
        <p className="text-xs text-slate-500">またはクリックして選択（画像・PDF、10MBまで）</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf,.heic,.heif"
          className="hidden"
          // 親のクリックで開く実装のため、input 自身のクリックが親へ伝播すると
          // 再度 click() が呼ばれてダイアログが開き直る。伝播を止める。
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) submit(f); e.target.value = '' }}
        />
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}

      {/* 提出済み一覧 */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((ev) => <EvidenceItem key={ev.id} ev={ev} />)}
        </ul>
      )}
    </div>
  )
}

function EvidenceItem({ ev }: { ev: EvidenceRow }) {
  const [pending, start] = useTransition()
  const s = STATUS[ev.status]
  const SIcon = s.icon
  const url = `/api/portal/evidence/${ev.id}`
  const isImage = ev.file_type?.startsWith('image/')

  const onDelete = () => {
    start(async () => { await deleteEvidenceAction(ev.id) })
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-carbon-700 bg-carbon-800/40 px-3 py-2.5">
      {/* ㉘ 画像はサムネイルをインライン表示（クリックで拡大） */}
      {isImage ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title="クリックで拡大" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={ev.file_name} className="h-10 w-10 rounded object-cover ring-1 ring-carbon-600" loading="lazy" />
        </a>
      ) : (
        <FileText className="h-8 w-8 shrink-0 rounded bg-carbon-700/50 p-1.5 text-slate-400" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-slate-200">
          {ev.doc_type ? `${DOC_LABEL[ev.doc_type]}：` : ''}{ev.file_name}
        </div>
        <div className="text-[11px] text-slate-500">{fmtSize(ev.file_size)} ・ {new Date(ev.created_at).toLocaleDateString('ja-JP')}</div>
        {ev.status === 'rejected' && ev.note && <div className="mt-0.5 text-[11px] text-rose-400">却下理由：{ev.note}</div>}
      </div>
      <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
        <SIcon className="h-3 w-3" /> {s.label}
      </span>
      <a href={url} target="_blank" rel="noopener noreferrer" title="プレビュー" className="rounded-md p-1.5 text-slate-400 hover:bg-white/5">
        <Eye className="h-3.5 w-3.5" />
      </a>
      <a href={`${url}?download=1`} title="ダウンロード" className="rounded-md p-1.5 text-slate-400 hover:bg-white/5">
        <Download className="h-3.5 w-3.5" />
      </a>
      {ev.status !== 'approved' && (
        <button onClick={onDelete} disabled={pending} title="削除（再提出）" className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-50">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}
    </li>
  )
}
