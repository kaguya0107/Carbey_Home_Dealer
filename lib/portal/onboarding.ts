import { createServiceRoleClient } from '@/lib/supabase/admin'
import type { OnboardingTaskRow, OnboardingTaskStatus } from '@/types/database'

/** ステップ表示順（step_key の並び。migration 010 の定義に一致）。 */
const STEP_ORDER = ['contract', 'documents', 'funding', 'training', 'launch']

export type OnboardingStep = {
  key: string
  label: string
  tasks: OnboardingTaskRow[]
  total: number
  done: number
  status: 'done' | 'current' | 'todo'
  /** 前ステップ未完了のためロック中（飛ばせない） */
  locked: boolean
}

export type OnboardingView = {
  steps: OnboardingStep[]
  totalTasks: number
  doneTasks: number
  pct: number
  /** 全ステップ完了＝機能解放 */
  unlocked: boolean
}

/** 素人にも分かる「次のアクション」ガイド（㉜追加）。 */
export type NextAction = {
  /** 何をするか（例：本人確認書類を提出する） */
  title: string
  /** どうすればよいか（一言の説明） */
  hint: string
  /** 遷移先（該当ページ）。null=本部の対応待ちで加盟店の操作不要 */
  href: string | null
  /** 操作主体：'member'=あなたが行う / 'admin'=本部の対応待ち */
  actor: 'member' | 'admin'
  /** 全完了なら done=true（次アクション不要） */
  done: boolean
}

/** link_key → 手続きページ・平易な説明。 */
const NEXT_GUIDE: Record<string, { href: string; verb: string }> = {
  contract: { href: '/portal/onboarding', verb: '本部が契約を登録すると自動で完了します' },
  identity: { href: '/portal/onboarding/evidence', verb: '本人確認書類（免許証・マイナンバー・パスポートのいずれか）を提出します' },
  antique_license: { href: '/portal/onboarding/evidence', verb: '古物商許可証を提出します（任意・6ヶ月以内）' },
  funding: { href: '/portal/onboarding/funding', verb: '資金準備（自己資金／資金調達）の手続きを進めます' },
  terms: { href: '/portal/terms', verb: '利用規約を確認して同意します' },
  manual: { href: '/portal/onboarding/manual', verb: '実践マニュアルを確認してチェックします' },
  completion: { href: '/portal/onboarding', verb: '他の項目がすべて完了すると自動で達成されます' },
}

/**
 * 次にやるべき1タスクを特定して案内を返す。
 * 現在ステップの未完了タスクのうち sort_order が最小のものを対象にする。
 */
export function getNextAction(view: OnboardingView): NextAction {
  if (view.unlocked) {
    return { title: 'オンボーディング完了', hint: 'すべての機能が解放されました。', href: '/portal/dashboard', actor: 'member', done: true }
  }
  // 未完了タスクを sort_order 順で先頭から探す（optional は後回し）
  const allTasks = view.steps.flatMap((s) => (s.locked ? [] : s.tasks))
  const pending = allTasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => (a.optional === b.optional ? a.sort_order - b.sort_order : a.optional ? 1 : -1))
  const next = pending[0]
  if (!next) {
    return { title: '次のステップの解放待ち', hint: '前のステップの完了をお待ちください。', href: '/portal/onboarding', actor: 'admin', done: false }
  }

  const guide = next.link_key ? NEXT_GUIDE[next.link_key] : undefined
  // 本部の対応待ち：manual 完了方式かつ link_key が本部承認系（identity/antique）で提出済みの可能性
  const isAdminWait = next.completion_type === 'manual' && !next.link_key
  if (isAdminWait) {
    return { title: next.title, hint: '本部の確認をお待ちください。', href: null, actor: 'admin', done: false }
  }
  return {
    title: next.title,
    hint: guide?.verb ?? 'このタスクを進めてください。',
    href: guide?.href ?? '/portal/onboarding',
    actor: 'member',
    done: false,
  }
}

/**
 * 複数加盟店のオンボーディングビューを一括取得（本部の一覧で進捗ステッパーを描くのに使う）。
 * タスクを1クエリでまとめて取得し、加盟店ごとに畳み込む（N+1を避ける）。
 */
export async function mapOnboardingViews(memberIds: string[]): Promise<Map<string, OnboardingView>> {
  const map = new Map<string, OnboardingView>()
  if (memberIds.length === 0) return map
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .select('*')
    .in('member_id', memberIds)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)

  const byMember = new Map<string, OnboardingTaskRow[]>()
  for (const t of (data ?? []) as unknown as OnboardingTaskRow[]) {
    const arr = byMember.get(t.member_id) ?? []
    arr.push(t)
    byMember.set(t.member_id, arr)
  }
  for (const [memberId, tasks] of byMember) map.set(memberId, buildOnboardingView(tasks))
  return map
}

/** 加盟店のオンボーディングタスク一覧（生）。 */
export async function listOnboardingTasks(memberId: string): Promise<OnboardingTaskRow[]> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('onboarding_tasks')
    .select('*')
    .eq('member_id', memberId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OnboardingTaskRow[]
}

/** タスクをステップ単位に畳み込んでビューを構築する。 */
export function buildOnboardingView(tasks: OnboardingTaskRow[]): OnboardingView {
  const byStep = new Map<string, OnboardingTaskRow[]>()
  for (const t of tasks) {
    const arr = byStep.get(t.step_key) ?? []
    arr.push(t)
    byStep.set(t.step_key, arr)
  }

  const keys = [...byStep.keys()].sort(
    (a, b) => (STEP_ORDER.indexOf(a) + 1 || 99) - (STEP_ORDER.indexOf(b) + 1 || 99),
  )

  let firstUnfinished = true
  let prevAllDone = true // 直前ステップまでが全完了か（ゲート判定用）
  const steps: OnboardingStep[] = keys.map((key) => {
    const arr = byStep.get(key)!
    const total = arr.length
    const done = arr.filter((t) => t.status === 'done').length
    // ゲート判定は optional（古物商など）を除いた必須タスクのみで行う（飛ばせるが任意）
    const required = arr.filter((t) => !t.optional)
    const stepDone = required.every((t) => t.status === 'done')
    let status: OnboardingStep['status']
    if (stepDone) {
      status = 'done'
    } else if (firstUnfinished) {
      status = 'current'
      firstUnfinished = false
    } else {
      status = 'todo'
    }
    // ロック: 完了しておらず、かつ直前ステップまでが未完了なら「飛ばせない」
    const locked = !stepDone && !prevAllDone
    prevAllDone = prevAllDone && stepDone
    return { key, label: arr[0].step_label, tasks: arr, total, done, status, locked }
  })

  const totalTasks = tasks.length
  const doneTasks = tasks.filter((t) => t.status === 'done').length
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0
  // 機能解放は「必須タスクが全完了」で判定（optional は解放をブロックしない）
  const requiredTasks = tasks.filter((t) => !t.optional)
  const unlocked = requiredTasks.length > 0 && requiredTasks.every((t) => t.status === 'done')
  return { steps, totalTasks, doneTasks, pct, unlocked }
}

/** 加盟店が auto タスクを自己完了する（ゲート厳守・DB関数側でも順序検証）。 */
export async function completeOwnTask(userId: string, taskId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.rpc('complete_own_task', { p_user_id: userId, p_task_id: taskId } as never)
  if (error) throw new Error(error.message)
}

/**
 * 実体（本人確認/資金/規約/マニュアル）→ タスク状態を同期する。
 * link_key 付きタスクを実体に合わせて done/todo に更新（自動化・飛ばせない）。
 */
export async function syncOnboardingStatus(memberId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase.rpc('sync_onboarding_status', { p_member_id: memberId } as never)
  if (error) throw new Error(error.message)
}

/**
 * 本部が加盟店へ進捗リマインドをWEBチャットで送る（㉒・手動）。
 * その加盟店の会話を取得/作成し、本部発のメッセージを投稿する。
 */
export async function sendProgressReminder(memberId: string, staffUserId: string, staffName: string | null, body?: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: conversationId, error: cErr } = await supabase.rpc('get_or_create_conversation', { p_member_id: memberId } as never)
  if (cErr) throw new Error(cErr.message)

  const text = body?.trim() || 'オンボーディング（スタートアップ）の進捗が停滞しています。未完了のタスクをお進めください。ご不明点はこのチャットでお気軽にご相談ください。'
  const { error: mErr } = await supabase.from('chat_messages').insert({
    conversation_id: conversationId as unknown as string,
    sender_id: staffUserId,
    sender_role: 'admin',
    sender_name: staffName,
    body: text,
  } as never)
  if (mErr) throw new Error(mErr.message)
}

/** member.user_id から自分のオンボーディングビューを取得（加盟店側）。 */
export async function getOwnOnboarding(userId: string): Promise<OnboardingView | null> {
  const supabase = createServiceRoleClient()
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle<{ id: string }>()
  if (!member) return null
  // 実体（本人確認/資金/規約/マニュアル）→ タスク状態を先に同期してから読む
  await syncOnboardingStatus(member.id)
  const tasks = await listOnboardingTasks(member.id)
  return buildOnboardingView(tasks)
}

/**
 * タスクの状態を変更する（本部）。done のとき completed_at を打刻。
 * 自動判定タスク（link_key 付き）を本部が変更した場合は admin_override を立て、
 * 以降 sync に上書きされないようにする（レビュー⑪-①：テスト・例外運用）。
 */
export async function updateTaskStatus(taskId: string, status: OnboardingTaskStatus): Promise<void> {
  const supabase = createServiceRoleClient()
  const { data: task } = await supabase
    .from('onboarding_tasks')
    .select('link_key')
    .eq('id', taskId)
    .maybeSingle<{ link_key: string | null }>()

  const patch: Partial<OnboardingTaskRow> = {
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }
  // 自動判定タスクを手で動かすときだけ上書きフラグを立てる
  if (task?.link_key) patch.admin_override = true

  const { error } = await supabase.from('onboarding_tasks').update(patch as never).eq('id', taskId)
  if (error) throw new Error(error.message)
}

/**
 * 自動判定タスクの上書きを解除し、実体に合わせて再同期する（本部）。
 * 「自動判定に戻す」操作。
 */
export async function clearTaskOverride(taskId: string, memberId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('onboarding_tasks')
    .update({ admin_override: false } as never)
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  await syncOnboardingStatus(memberId)
}

/** 加盟店に既定タスクが無ければ生成する（本部画面を開いたときの保険）。 */
export async function ensureOnboardingTasks(memberId: string): Promise<void> {
  const supabase = createServiceRoleClient()
  const { count } = await supabase
    .from('onboarding_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId)
  if ((count ?? 0) > 0) return
  // seed 関数（public ラッパー）を RPC で呼ぶ
  await supabase.rpc('seed_onboarding_tasks', { p_member_id: memberId } as never)
}
