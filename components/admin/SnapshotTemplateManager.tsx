'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, Power } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import {
  MAKERS,
  MAKER_NAME_BY_CODE,
  REGION_PRESETS,
  type SnapshotTemplate,
  type TemplateInput,
} from '@/lib/portal/snapshot-config'
import { PREFECTURES } from '@/lib/portal/market-snapshot'
import {
  createTemplateAction,
  updateTemplateAction,
  toggleTemplateAction,
  deleteTemplateAction,
} from '@/app/admin/market-snapshot/settings/actions'

type EditorState =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; template: SnapshotTemplate }

const JST = 'Asia/Tokyo'
function fmtLast(iso: string | null): string {
  if (!iso) return '未実行'
  return new Date(iso).toLocaleString('ja-JP', { timeZone: JST, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function SnapshotTemplateManager({ templates }: { templates: SnapshotTemplate[] }) {
  const router = useRouter()
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const enabledCount = templates.filter((t) => t.scheduledEnabled).length
  const coveredPrefs = new Set(templates.filter((t) => t.scheduledEnabled).flatMap((t) => t.prefectures))

  const run = (id: string | null, fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null)
    setBusyId(id)
    start(async () => {
      const r = await fn()
      setBusyId(null)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setEditor({ mode: 'closed' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* サマリ + 追加 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          有効テンプレ <span className="font-semibold text-slate-800">{enabledCount}</span> 件 ／ 全{templates.length}件・
          有効分の対象県 <span className="font-semibold text-slate-800">{coveredPrefs.size}</span>/47県
        </p>
        <button
          type="button"
          onClick={() => { setError(null); setEditor({ mode: 'new' }) }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> テンプレを追加
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {editor.mode !== 'closed' && (
        <TemplateEditor
          key={editor.mode === 'edit' ? editor.template.id : 'new'}
          initial={editor.mode === 'edit' ? editor.template : null}
          pending={pending}
          onCancel={() => setEditor({ mode: 'closed' })}
          onSubmit={(input) =>
            run(editor.mode === 'edit' ? editor.template.id : 'new', () =>
              editor.mode === 'edit'
                ? updateTemplateAction(editor.template.id, input)
                : createTemplateAction(input),
            )
          }
        />
      )}

      {/* 一覧 */}
      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">テンプレ</th>
                  <th className="px-3 py-3 font-medium">対象</th>
                  <th className="px-3 py-3 font-medium">取得時刻</th>
                  <th className="px-3 py-3 font-medium">最終取得</th>
                  <th className="px-3 py-3 text-center font-medium">状態</th>
                  <th className="px-3 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">テンプレがありません。「テンプレを追加」から作成してください。</td></tr>
                )}
                {templates.map((t) => (
                  <tr key={t.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{t.name}</div>
                      {t.description && <div className="text-xs text-slate-400">{t.description}</div>}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <div className="max-w-[260px]">
                        <span className="text-slate-700">{t.prefectures.length}県</span>
                        <span className="text-slate-400"> ・ </span>
                        <span className="text-slate-700">{t.makerCodes.length}メーカー</span>
                        <div className="mt-0.5 truncate text-xs text-slate-400" title={t.prefectures.join('・')}>
                          {t.prefectures.join('・')}
                        </div>
                        <div className="truncate text-xs text-slate-400" title={t.makerCodes.map((c) => MAKER_NAME_BY_CODE[c] ?? c).join('・')}>
                          {t.makerCodes.map((c) => MAKER_NAME_BY_CODE[c] ?? c).join('・')}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-slate-600">{t.scheduledTimeJst ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-500">{fmtLast(t.scheduledLastRunAt)}</td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        disabled={pending && busyId === t.id}
                        onClick={() => run(t.id, () => toggleTemplateAction(t.id, !t.scheduledEnabled))}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                          t.scheduledEnabled
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                        title={t.scheduledEnabled ? 'クリックで無効化' : 'クリックで有効化'}
                      >
                        {pending && busyId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                        {t.scheduledEnabled ? '有効' : '無効'}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => { setError(null); setEditor({ mode: 'edit', template: t }) }}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                          title="編集"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={pending && busyId === t.id}
                          onClick={() => {
                            if (confirm(`テンプレ「${t.name}」を削除します。よろしいですか？`)) {
                              run(t.id, () => deleteTemplateAction(t.id))
                            }
                          }}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <p className="text-xs text-slate-400">
        ※ 有効化したテンプレは、設定した取得時刻（JST）に VPS の自動収集で巡回されます（各テンプレは3日クールダウン）。対象県・メーカーを増やすほど網羅性は上がりますが、VPSのスクレイピング量も増えます。時刻を分散させると負荷が平準化されます。
      </p>
    </div>
  )
}

// ------- エディタ -------
function TemplateEditor({
  initial,
  pending,
  onCancel,
  onSubmit,
}: {
  initial: SnapshotTemplate | null
  pending: boolean
  onCancel: () => void
  onSubmit: (input: TemplateInput) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [prefs, setPrefs] = useState<Set<string>>(new Set(initial?.prefectures ?? []))
  const [makers, setMakers] = useState<Set<string>>(new Set(initial?.makerCodes ?? []))
  const [enabled, setEnabled] = useState(initial?.scheduledEnabled ?? false)
  const [time, setTime] = useState(initial?.scheduledTimeJst ?? '')

  const togglePref = (p: string) =>
    setPrefs((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })
  const toggleMaker = (c: string) =>
    setMakers((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })

  const toggleRegion = (regionPrefs: string[]) =>
    setPrefs((s) => {
      const n = new Set(s)
      const allOn = regionPrefs.every((p) => n.has(p))
      for (const p of regionPrefs) allOn ? n.delete(p) : n.add(p)
      return n
    })

  const submit = () =>
    onSubmit({
      name,
      description: description || null,
      makerCodes: [...makers],
      prefectures: [...prefs],
      scheduledEnabled: enabled,
      scheduledTimeJst: time || null,
    })

  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition ${
      on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`

  return (
    <Card className="border-brand-200">
      <CardBody className="space-y-4">
        <div className="text-sm font-semibold text-slate-800">{initial ? 'テンプレを編集' : '新規テンプレ'}</div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">テンプレ名 <span className="text-rose-500">*</span></span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例）東海　トヨタ・レクサス"
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">メモ（任意）</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
        </div>

        {/* 都道府県 */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">都道府県 <span className="text-rose-500">*</span></span>
            <span className="text-xs text-slate-400">選択 {prefs.size}件</span>
            <div className="ml-auto flex flex-wrap gap-1">
              <button type="button" onClick={() => setPrefs(new Set(PREFECTURES))} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">全国</button>
              <button type="button" onClick={() => setPrefs(new Set())} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">クリア</button>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            {REGION_PRESETS.map((region) => (
              <div key={region.key} className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleRegion(region.prefectures)}
                  className="w-20 shrink-0 rounded bg-slate-100 px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-200"
                >
                  {region.label}
                </button>
                {region.prefectures.map((p) => (
                  <button key={p} type="button" onClick={() => togglePref(p)} className={chip(prefs.has(p))}>
                    {p}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* メーカー */}
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">メーカー <span className="text-rose-500">*</span></span>
            <span className="text-xs text-slate-400">選択 {makers.size}件</span>
            <div className="ml-auto flex flex-wrap gap-1">
              <button type="button" onClick={() => setMakers(new Set(MAKERS.map((m) => m.code)))} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">全メーカー</button>
              <button type="button" onClick={() => setMakers(new Set())} className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50">クリア</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 p-3">
            {MAKERS.map((m) => (
              <button key={m.code} type="button" onClick={() => toggleMaker(m.code)} className={chip(makers.has(m.code))}>
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* 定期取得 */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-3 py-2.5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400" />
            定期取得を有効にする
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            取得時刻（JST）
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-brand-400 focus:outline-none"
            />
          </label>
          <span className="text-xs text-slate-400">※有効化には取得時刻が必要。各テンプレは3日ごとに巡回。</span>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">キャンセル</button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? '更新する' : '作成する'}
          </button>
        </div>
      </CardBody>
    </Card>
  )
}
