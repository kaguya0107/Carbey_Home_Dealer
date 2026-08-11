import { LogOut } from 'lucide-react'

/** サインアウト (POST /auth/signout)。フォーム送信のみで JS 不要。 */
export default function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
      >
        <LogOut className="h-4 w-4" />
        ログアウト
      </button>
    </form>
  )
}
