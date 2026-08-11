'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import {
  createTemplate,
  updateTemplate,
  setTemplateEnabled,
  deleteTemplate,
  type TemplateInput,
} from '@/lib/portal/snapshot-config'

type ActionResult = { ok: true } | { ok: false; error: string }

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : '操作に失敗しました。' }
}

const PATH = '/admin/market-snapshot/settings'

export async function createTemplateAction(input: TemplateInput): Promise<ActionResult> {
  await requireStaff()
  try {
    await createTemplate(input)
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateTemplateAction(id: string, input: TemplateInput): Promise<ActionResult> {
  await requireStaff()
  try {
    await updateTemplate(id, input)
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleTemplateAction(id: string, enabled: boolean): Promise<ActionResult> {
  await requireStaff()
  try {
    await setTemplateEnabled(id, enabled)
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  await requireStaff()
  try {
    await deleteTemplate(id)
    revalidatePath(PATH)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
