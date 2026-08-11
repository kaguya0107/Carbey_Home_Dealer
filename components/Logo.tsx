import Image from 'next/image'

/** Carbey ロゴ。variant でテキスト入り横組み / アイコン単体を切り替える。 */
export default function Logo({
  variant = 'text',
  className = '',
  priority = false,
}: {
  variant?: 'text' | 'icon'
  className?: string
  priority?: boolean
}) {
  if (variant === 'icon') {
    return (
      <Image
        src="/logo-icon.png"
        alt="Carbey"
        width={32}
        height={32}
        priority={priority}
        className={className}
      />
    )
  }
  // テキスト入り横組み (1536×1024 → 3:2)
  return (
    <Image
      src="/logo-with-text.png"
      alt="Carbey"
      width={120}
      height={80}
      priority={priority}
      className={className}
    />
  )
}
