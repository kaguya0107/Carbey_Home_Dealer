/**
 * 画面遷移・再読込中に表示する小さなローディングインジケータ（レビュー⑦：反映中の誤認防止）。
 * 上部に細いアニメーションバー＋小さな「読み込み中…」を出す。loading.tsx から使用。
 */
export default function RouteLoading({ dark = false }: { dark?: boolean }) {
  return (
    <div className="pointer-events-none relative">
      {/* 上部の細いプログレスバー */}
      <div className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden ${dark ? 'bg-carbon-800' : 'bg-slate-100'}`}>
        <div className="h-full w-1/3 animate-[routebar_1s_ease-in-out_infinite] rounded-full bg-brand-500" />
      </div>
      {/* 小さな読み込み表示 */}
      <div className={`flex items-center gap-2 px-1 py-3 text-xs ${dark ? 'text-slate-400' : 'text-slate-400'}`}>
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        読み込み中…
      </div>
      <style>{`@keyframes routebar{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  )
}
