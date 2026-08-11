'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff } from '@/lib/auth/session'
import { markAllAdminRead } from '@/lib/portal/notifications'

export async function markAllReadAction() {
  await requireStaff()
  await markAllAdminRead()
  revalidatePath('/admin/notifications')
  revalidatePath('/admin', 'layout')
}
