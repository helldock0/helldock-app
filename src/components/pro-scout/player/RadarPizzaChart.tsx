'use client'

// FBref-style pizza chart: each wedge is one stat, filled radius = percentile.
// Wedges are a single accent color (per role); category grouping is conveyed
// by subtle opacity tiers across the four categories.

import type { PercentileCategory, PercentileSlice } from '@/lib/pro-scout/types'
import { CATEGORY_OPACITY } from '@/lib/dossier/role-colors'
import { useState } from 'react'

const CATEGORY_LABEL: Record<PercentileCategory, string> = {
  firepower: 'Firepower',
  impact: 'Impact',
  survival: 'Survival',
  consistency: 'Consistency',
}

const SIZE = 360
const CX = SIZE / 2
const CY = SIZE / 2
const R_OUTER = 130
const R_LABEL = R_OUTER + 18
const GUIDE_RINGS = [0.25, 0.5, 0.75, 1]

function polar(angle: number, radius: number): [number, number] {
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius]
}

function wedgePath(startAngle: number, endAngle: number, radius: number): string {
  if (radius <= 0.01) return ''
  const [x1, y1] = polar(startAngle, radius)
  const [x2, y2] = polar(endAngle, radius)
  const large = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${CX} ${CY} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
}

export default function RadarPizzaChart({
  slices,
  accent = '#FFD700',
}: {
  slices: PercentileSlice[]
  /** Hex color used for every wedge. Defaults to gold. */
  accent?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const n = slices.length
  const step = (Math.PI * 2) / n
  const wedges = slices.map((s, i) => {
    const start = -Math.PI / 2 + i * step + step * 0.04
    const end = -Math.PI / 2 + (i + 1) * step - step * 0.04
    const mid = (start + end) / 2
    const pct = s.percentile ?? 0
    const r = (pct / 100) * R_OUTER
    return { slice: s, start, end, mid, pct, r }
  })

  const categories: PercentileCategory[] = ['firepower', 'impact', 'survival', 'consistency']

  return (
    <div className="w-full flex flex-col items-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[360px]">
        {/* Guide rings */}
        {GUIDE_RINGS.map((g, i) => (
          <circle
            key={i}
            cx={CX}
            cy={CY}
            r={R_OUTER * g}
            fill="none"
            stroke="#2F2F36"
            strokeDasharray={g === 1 ? undefined : '2 3'}
            strokeWidth={g === 1 ? 1 : 0.5}
          />
        ))}
        {/* Background wedges — all accent at very low opacity for the "track" */}
        {wedges.map((w, i) => (
          <path
            key={`bg-${i}`}
            d={wedgePath(w.start, w.end, R_OUTER)}
            fill={accent}
            opacity={0.05}
          />
        ))}
        {/* Filled wedges — accent, opacity tiered by category */}
        {wedges.map((w, i) => {
          const baseOpacity = CATEGORY_OPACITY[w.slice.category]
          const opacity =
            hover == null
              ? baseOpacity
              : hover === i
              ? Math.min(1, baseOpacity + 0.15)
              : baseOpacity * 0.45
          return (
            <path
              key={`fg-${i}`}
              d={wedgePath(w.start, w.end, w.r)}
              fill={accent}
              opacity={opacity}
              stroke={accent}
              strokeWidth={0.8}
              strokeOpacity={opacity}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
            />
          )
        })}
        {/* Percentile values on wedge — white for legibility across all opacity tiers */}
        {wedges.map((w, i) => {
          if (w.pct < 12) return null
          const [tx, ty] = polar(w.mid, Math.max(20, w.r * 0.65))
          return (
            <text
              key={`v-${i}`}
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={700}
              fill="#F5F5F7"
              style={{ pointerEvents: 'none', textShadow: '0 0 2px rgba(0,0,0,0.5)' }}
            >
              {w.pct}
            </text>
          )
        })}
        {/* Outer labels */}
        {wedges.map((w, i) => {
          const [tx, ty] = polar(w.mid, R_LABEL)
          const anchor =
            Math.cos(w.mid) > 0.15 ? 'start' : Math.cos(w.mid) < -0.15 ? 'end' : 'middle'
          return (
            <text
              key={`l-${i}`}
              x={tx}
              y={ty}
              textAnchor={anchor}
              dominantBaseline="central"
              fontSize={10}
              fill={hover === i ? '#F5F5F7' : '#8A8A93'}
              fontWeight={hover === i ? 700 : 500}
              style={{ transition: 'fill 120ms' }}
            >
              {w.slice.label}
            </text>
          )
        })}
      </svg>

      {/* Hover detail / category legend (opacity tier preview) */}
      <div className="mt-3 text-center min-h-[2.5rem]">
        {hover != null ? (
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-2">
              {CATEGORY_LABEL[wedges[hover].slice.category]} · {wedges[hover].slice.label}
            </div>
            <div className="text-sm font-mono tnum text-fg">
              {wedges[hover].slice.value ?? '—'}
              <span className="text-muted-2 ml-2">
                p{wedges[hover].slice.percentile ?? '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 flex-wrap justify-center">
            {categories.map((cat) => (
              <span key={cat} className="inline-flex items-center gap-1.5 text-2xs text-muted-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: accent, opacity: CATEGORY_OPACITY[cat] }}
                />
                {CATEGORY_LABEL[cat]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
