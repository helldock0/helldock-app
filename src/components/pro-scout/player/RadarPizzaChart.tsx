'use client'

// FBref-style pizza chart: each wedge is one stat, filled radius = percentile.
// Wedges are colored by category, grouped around the circle.

import type { PercentileCategory, PercentileSlice } from '@/lib/pro-scout/types'
import { useState } from 'react'

const CATEGORY_COLOR: Record<PercentileCategory, string> = {
  firepower: '#FFD700',   // gold
  impact: '#DC143C',      // crimson
  survival: '#34D399',    // win-green
  consistency: '#60A5FA', // blue
}

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

export default function RadarPizzaChart({ slices }: { slices: PercentileSlice[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const n = slices.length
  const step = (Math.PI * 2) / n
  // Start at top (-π/2), go clockwise
  const wedges = slices.map((s, i) => {
    const start = -Math.PI / 2 + i * step + step * 0.04   // tiny gap between wedges
    const end = -Math.PI / 2 + (i + 1) * step - step * 0.04
    const mid = (start + end) / 2
    const pct = s.percentile ?? 0
    const r = (pct / 100) * R_OUTER
    return { slice: s, start, end, mid, pct, r }
  })

  // Active group for legend
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
        {/* Background wedges (full @ low opacity) */}
        {wedges.map((w, i) => (
          <path
            key={`bg-${i}`}
            d={wedgePath(w.start, w.end, R_OUTER)}
            fill={CATEGORY_COLOR[w.slice.category]}
            opacity={0.07}
          />
        ))}
        {/* Filled wedges */}
        {wedges.map((w, i) => (
          <path
            key={`fg-${i}`}
            d={wedgePath(w.start, w.end, w.r)}
            fill={CATEGORY_COLOR[w.slice.category]}
            opacity={hover == null ? 0.78 : hover === i ? 0.95 : 0.4}
            stroke={CATEGORY_COLOR[w.slice.category]}
            strokeWidth={0.8}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
          />
        ))}
        {/* Percentile values on wedge */}
        {wedges.map((w, i) => {
          if (w.pct < 8) return null
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
              fill="#1B1B1F"
              style={{ pointerEvents: 'none' }}
            >
              {w.pct}
            </text>
          )
        })}
        {/* Outer labels */}
        {wedges.map((w, i) => {
          const [tx, ty] = polar(w.mid, R_LABEL)
          // Avoid upside-down text by anchoring per-quadrant
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

      {/* Hover detail / legend */}
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
                  style={{ backgroundColor: CATEGORY_COLOR[cat] }}
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
