'use server'

import { revalidatePath } from 'next/cache'
import { requireFeature } from '@/lib/auth/session'
import { setShippingRate, deleteShippingRate, addSpecialMaker, deleteSpecialMaker, setShippingFromPref, setShippingDefaultToPref } from '@/lib/portal/shipping'
import { isPrefecture } from '@/lib/portal/prefectures'

/** #50 陸送の発地（拠点）を設定。料金マスタの発地と揃えると自動計算が効く。 */
export async function setFromPrefAction(formData: FormData) {
  await requireFeature('members')
  const pref = String(formData.get('from_pref') ?? '')
  if (!isPrefecture(pref)) return
  await setShippingFromPref(pref)
  revalidatePath('/admin/shipping')
}

/** #52 加盟店のデフォルト陸送先（着地）を設定。空＝デフォルトなし。新規案件・加盟店画面の初期値になる。 */
export async function setDefaultToPrefAction(formData: FormData) {
  await requireFeature('members')
  const pref = String(formData.get('to_pref') ?? '')
  await setShippingDefaultToPref(pref || null)
  revalidatePath('/admin/shipping')
}

/** 陸送費（発地×着地）を設定。 */
export async function setRateAction(formData: FormData) {
  await requireFeature('members')
  const from = String(formData.get('from_pref') ?? '')
  const to = String(formData.get('to_pref') ?? '')
  const amount = Number(String(formData.get('amount') ?? '').replace(/[^\d]/g, ''))
  if (!isPrefecture(from) || !isPrefecture(to) || !amount || amount < 0) {
    return
  }
  await setShippingRate(from, to, amount)
  revalidatePath('/admin/shipping')
}

/** 料金設定を削除。 */
export async function deleteRateAction(formData: FormData) {
  await requireFeature('members')
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await deleteShippingRate(id)
  revalidatePath('/admin/shipping')
}

/** 特殊車メーカーを追加。 */
export async function addMakerAction(formData: FormData) {
  await requireFeature('members')
  const maker = String(formData.get('maker') ?? '').trim()
  if (!maker) return
  await addSpecialMaker(maker)
  revalidatePath('/admin/shipping')
}

/** 特殊車メーカーを削除。 */
export async function deleteMakerAction(formData: FormData) {
  await requireFeature('members')
  const id = String(formData.get('id') ?? '')
  if (!id) return
  await deleteSpecialMaker(id)
  revalidatePath('/admin/shipping')
}
