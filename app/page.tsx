import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/session'

export default async function Home() {
  const session = await getSessionUser()
  if (!session) redirect('/login')
  const staff = session.role !== 'member'
  redirect(staff ? '/admin/dashboard' : '/portal/dashboard')
}
