'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireMember } from '@/lib/auth/session'
import { updateOwnMember } from '@/lib/portal/members'

function str(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

/**
 * 加盟店本人による連絡先系の自己更新。
 * 編集できるのは連絡先 (基本情報の一部) と陸送先のみ。
 * メールアドレス (ログインID)・プラン・契約・財務・各種ステータスは本部専用のため、ここでは一切受け付けない。
 */
export async function updateOwnProfileAction(formData: FormData) {
  const session = await requireMember()

  await updateOwnMember(session.userId, {
    member_name: str(formData.get('member_name')) ?? undefined,
    company_name: str(formData.get('company_name')),
    phone_mobile: str(formData.get('phone_mobile')),
    phone_landline: str(formData.get('phone_landline')),
    address: str(formData.get('address')),
    delivery_name: str(formData.get('delivery_name')),
    delivery_contact: str(formData.get('delivery_contact')),
    delivery_address: str(formData.get('delivery_address')),
    delivery_pref: str(formData.get('delivery_pref')),
  })

  revalidatePath('/portal/profile')
  redirect('/portal/profile?saved=1')
}
