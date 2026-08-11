import { FileText } from 'lucide-react'
import { requireStaff } from '@/lib/auth/session'
import { listRegistryNotes } from '@/lib/portal/editable-notes'
import EditableNotesEditor from '@/components/admin/EditableNotesEditor'

export const dynamic = 'force-dynamic'

export default async function AdminNotesPage() {
  await requireStaff()
  const notes = await listRegistryNotes()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <FileText className="h-5 w-5 text-brand-500" /> 注意書き設定
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          加盟店に表示する注意書き・ご案内を、コード改修なしでここから編集できます。保存すると表示先に即時反映されます。
        </p>
      </div>
      <EditableNotesEditor notes={notes} />
    </div>
  )
}
