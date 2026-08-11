'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireFeature } from '@/lib/auth/session'
import { updateTaskStatus, clearTaskOverride, ensureOnboardingTasks, sendProgressReminder, listOnboardingTasks } from '@/lib/portal/onboarding'
import type { OnboardingTaskStatus } from '@/types/database'

const STATUSES: OnboardingTaskStatus[] = ['todo', 'in_progress', 'done']

/**
 * ㊹ 進捗タスクを「まとめて」更新する（本部）。1件ずつの都度実行をやめ、変更した行だけを一括反映。
 * 各行の値は t_<taskId> = 'auto' | 'todo' | 'in_progress' | 'done'。
 *   - auto（自動判定タスクのみ）：上書き中なら解除して自動運用に戻す。
 *   - todo/in_progress/done：現在と異なる場合のみ更新（自動判定タスクは上書きになる）。
 * 変更が無い行は何もしない（自動判定タスクを誤って上書きしない）。
 */
export async function bulkSetTaskStatusAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  if (!memberId) redirect('/admin/onboarding')
  const tasks = await listOnboardingTasks(memberId)
  for (const t of tasks) {
    const sel = String(formData.get(`t_${t.id}`) ?? '')
    if (!sel) continue
    if (t.link_key) {
      if (sel === 'auto') {
        if (t.admin_override) await clearTaskOverride(t.id, memberId)
      } else if (STATUSES.includes(sel as OnboardingTaskStatus)) {
        if (!t.admin_override || t.status !== sel) await updateTaskStatus(t.id, sel as OnboardingTaskStatus)
      }
    } else if (STATUSES.includes(sel as OnboardingTaskStatus) && t.status !== sel) {
      await updateTaskStatus(t.id, sel as OnboardingTaskStatus)
    }
  }
  revalidatePath(`/admin/onboarding/${memberId}`)
  redirect(`/admin/onboarding/${memberId}?saved=1`)
}

/** 自動判定タスクの上書きを解除して実体に再同期する（本部・レビュー⑪-①）。 */
export async function clearTaskOverrideAction(formData: FormData) {
  await requireFeature('members')
  const taskId = String(formData.get('task_id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  if (!taskId || !memberId) redirect('/admin/onboarding')
  await clearTaskOverride(taskId, memberId)
  revalidatePath(`/admin/onboarding/${memberId}`)
  redirect(`/admin/onboarding/${memberId}`)
}

/** タスクの状態を変更する（本部）。 */
export async function setTaskStatusAction(formData: FormData) {
  await requireFeature('members')
  const taskId = String(formData.get('task_id') ?? '')
  const memberId = String(formData.get('member_id') ?? '')
  const status = String(formData.get('status') ?? '') as OnboardingTaskStatus
  if (!taskId || !memberId || !STATUSES.includes(status)) redirect('/admin/onboarding')

  await updateTaskStatus(taskId, status)
  revalidatePath(`/admin/onboarding/${memberId}`)
  redirect(`/admin/onboarding/${memberId}`)
}

/** 加盟店に既定タスクが無ければ生成する。 */
export async function seedTasksAction(formData: FormData) {
  await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  if (!memberId) redirect('/admin/onboarding')
  await ensureOnboardingTasks(memberId)
  revalidatePath(`/admin/onboarding/${memberId}`)
  redirect(`/admin/onboarding/${memberId}`)
}

/** 進捗が遅い加盟店へWEBチャットでリマインドを送る（㉒・本部手動）。 */
export async function sendReminderAction(formData: FormData) {
  const session = await requireFeature('members')
  const memberId = String(formData.get('member_id') ?? '')
  if (!memberId) redirect('/admin/onboarding')
  await sendProgressReminder(memberId, session.userId, session.name ?? null)
  revalidatePath('/admin/onboarding')
  redirect('/admin/onboarding?reminded=1')
}
