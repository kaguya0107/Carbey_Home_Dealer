/**
 * 加盟店ダークダッシュボード用の軽量 SVG チャート（依存ライブラリなし）。
 * ダーク面 (#111829 前後) 上での視認性を意識した配色。
 */

/* ---------- ドーナツ（販売状況・オンボーディング進捗リング等） ---------- */
export type DonutSlice = { label: string; value: number; color: string }

export function DarkDonut({
  slices,
  centerTop,
  centerMain,
  centerUnit,
  size = 168,
  thickness = 20,
}: {
  slices: DonutSlice[]
  centerTop?: string
  centerMain?: string | number
  centerUnit?: string
  size?: number
  thickness?: number
}) {
  const total = Math.max(1, slices.reduce((s, x) => s + x.value, 0))
  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  let offset = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#1f2b47" strokeWidth={thickness} />
      {slices.map((s) => {
        const len = (s.value / total) * circ
        const seg = (
          <circle
            key={s.label}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
          />
        )
        offset += len
        return seg
      })}
      <g className="rotate-90" style={{ transformOrigin: `${c}px ${c}px` }}>
        {centerTop && (
          <text x={c} y={c - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
            {centerTop}
          </text>
        )}
        {centerMain != null && (
          <text x={c} y={c + 8} textAnchor="middle" className="fill-white text-xl font-bold">
            {centerMain}
            {centerUnit && <tspan className="fill-slate-400 text-xs"> {centerUnit}</tspan>}
          </text>
        )}
      </g>
    </svg>
  )
}

/** 進捗リング（単一％・グロー付き）。KPIの小型表示用。 */
export function DarkProgressRing({ pct, size = 68, color = '#f5362b' }: { pct: number; size?: number; color?: string }) {
  const thickness = 7
  const r = (size - thickness) / 2
  const c = size / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
      <circle cx={c} cy={c} r={r} fill="none" stroke="#1f2b47" strokeWidth={thickness} />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={thickness}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
      />
      <text x={c} y={c + 4} textAnchor="middle" className="rotate-90 fill-white text-sm font-bold" style={{ transformOrigin: `${c}px ${c}px` }}>
        {pct}%
      </text>
    </svg>
  )
}

/* ---------- 折れ線（売上推移・単系列） ---------- */
export function DarkLineChart({
  data,
  labels,
  height = 220,
  color = '#f5362b',
  valueFormat,
}: {
  data: number[]
  labels: string[]
  height?: number
  color?: string
  valueFormat?: (v: number) => string
}) {
  const W = 640
  const H = height
  const padL = 56 // Y軸目盛りラベル用（㉑）
  const padR = 16
  const padTop = 24
  const padBottom = 28
  const max = Math.max(1, ...data)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const stepX = (W - padL - padR) / Math.max(1, labels.length - 1)
  const x = (i: number) => padL + i * stepX
  const y = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBottom)
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(data.length - 1)} ${H - padBottom} L ${x(0)} ${H - padBottom} Z`
  const ratios = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <defs>
        <linearGradient id="darkline-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ratios.map((r, i) => {
        const gy = padTop + r * (H - padTop - padBottom)
        const val = max - r * span // 上が最大
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="#1f2b47" strokeWidth={1} />
            <text x={padL - 8} y={gy + 3} textAnchor="end" className="fill-slate-500 text-[10px]">
              {valueFormat ? valueFormat(val) : Math.round(val).toLocaleString()}
            </text>
          </g>
        )
      })}
      <path d={area} fill="url(#darkline-fill)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={3.5} fill="#0c1120" stroke={color} strokeWidth={2} />
          {valueFormat && (
            <text x={x(i)} y={y(v) - 10} textAnchor="middle" className="fill-slate-300 text-[10px]">
              {valueFormat(v)}
            </text>
          )}
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={l} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
          {l}
        </text>
      ))}
    </svg>
  )
}

/* ---------- レーダー（AIスコア） ---------- */
export function DarkRadar({
  axes,
  values,
  size = 150,
  color = '#f5362b',
}: {
  axes: string[]
  values: number[] // 0-100
  size?: number
  color?: string
}) {
  const c = size / 2
  const r = size / 2 - 22
  const n = axes.length
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const point = (i: number, ratio: number) => [c + r * ratio * Math.cos(angle(i)), c + r * ratio * Math.sin(angle(i))]
  const rings = [0.25, 0.5, 0.75, 1]
  const poly = (ratio: number) => axes.map((_, i) => point(i, ratio).join(',')).join(' ')
  const dataPoly = values.map((v, i) => point(i, v / 100).join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {rings.map((ratio) => (
        <polygon key={ratio} points={poly(ratio)} fill="none" stroke="#1f2b47" strokeWidth={1} />
      ))}
      {axes.map((_, i) => {
        const [px, py] = point(i, 1)
        return <line key={i} x1={c} y1={c} x2={px} y2={py} stroke="#1f2b47" strokeWidth={1} />
      })}
      <polygon points={dataPoly} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} />
      {values.map((v, i) => {
        const [px, py] = point(i, v / 100)
        return <circle key={i} cx={px} cy={py} r={2.5} fill={color} />
      })}
      {axes.map((a, i) => {
        const [px, py] = point(i, 1.28)
        return (
          <text key={a} x={px} y={py} textAnchor="middle" dominantBaseline="middle" className="fill-slate-500 text-[8px]">
            {a}
          </text>
        )
      })}
    </svg>
  )
}
