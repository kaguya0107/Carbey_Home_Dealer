'use client'

/**
 * <form action={serverAction}> 内で使う送信ボタン。クリック時に確認ダイアログを出し、
 * キャンセルされたら送信を止める（破壊的操作の誤操作防止）。
 */
export function ConfirmSubmit({
  children,
  message,
  className,
}: {
  children: React.ReactNode
  message: string
  className?: string
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
