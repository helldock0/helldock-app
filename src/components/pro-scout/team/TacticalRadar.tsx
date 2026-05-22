'use client'

// 6-spoke tactical signature radar — pistol / bonus / plant / closeout /
// comeback / OT. Raw % values (0-100), not percentiles. Same custom-SVG
// language as the player RadarPizzaChart so the two pages feel like one
// product.

import type { ProTacticalPatterns } from '@/lib/pro-scout/types'
import { useState } from 'react'

type Spoke = {
  key: string
  label: string
  value: number | null     // 0..100
  sub: string              // small caption under hover detail
}

// Chart math is centered at (CX, CY) with radius R_OUTER. The SVG viewBox
// is padded horizontally (negative VIEW_X start, wider VIEW_W) so labels at
// 3 and 9 o'clock ("Bonus", "Comeback") don't overflow.
const CX = 130
const CY = 130
const R_OUTER = 96
const R_LABEL = R_OUTER + 18
const VIEW_W = 320
const VIEW_H = 260
const VIEW_X = -30     // (VIEW_W - 260) / 2 of left padding, signed negative
const VIEW_Y = 0
const GUIDE_RINGS = [0.25, 0.5, 0.75, 1]

function polar(angle: number, radius: number): [number, number] {
  return [CX + Math.cos(angle) * radius, CY + Math.sin(angle) * radius]
}

function wedgePath(start: number, end: number, radius: number): string {
  if (radius <= 0.01) return ''
  const [x1, y1] = polar(start, radius)
  const [x2, y2] = polar(end, radius)
  const large = end - start > Math.PI ? 1 : 0
  return `M ${CX} ${CY} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
}

function spokesFromTactics(t: ProTacticalPatterns): Spoke[] {
  const otPct = t.otPlayed > 0 ? Math.round((t.otWins / t.otPlayed) * 100) : null
  return [
    { key: 'pistol',   label: 'Pistol',   value: t.pistolWinPct,      sub: `${t.pistolWins}/${t.pistolPlayed} pistols` },
    { key: 'bonus',    label: 'Bonus',    value: t.bonusRoundWinPct,  sub: `${t.bonusRoundWins}/${t.bonusRoundPlayed} (R2+R14)` },
    { key: 'plant',    label: 'Plant',    value: t.plantRateAtk,      sub: `n=${t.plantAtkN} ATK rounds` },
    { key: 'closeout', label: 'Closeout', value: t.closeoutRate,      sub: 'leading 1H → won map' },
    { key: 'comeback', label: 'Comeback', value: t.comebackRate,      sub: 'trailing 1H → won map' },
    { key: 'ot',       label: 'OT',       value: otPct,               sub: `${t.otWins}/${t.otPlayed} OT maps` },
  ]
}

export default function TacticalRadar({
  tactics,
  accent = '#FFD700',
}: {
  tactics: ProTacticalPatterns
  accent?: string
}) {
  const spokes = spokesFromTactics(tactics)
  const [hover, setHover] = useState<number | null>(null)
  const n = spokes.length
  const step = (Math.PI * 2) / n

  const wedges = spokes.map((s, i) => {
    const start = -Math.PI / 2 + i * step + step * 0.04
    const end = -Math.PI / 2 + (i + 1) * step - step * 0.04
    const mid = (start + end) / 2
    const pct = s.value ?? 0
    const r = (pct / 100) * R_OUTER
    return { spoke: s, start, end, mid, pct, r }
  })

  const activeSpoke = hover != null ? wedges[hover].spoke : null

  return (
    <div className="w-full flex flex-col items-center">
      <svg
        viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}
        className="w-full max-w-[320px]"
      >
        {/* Guide rings + axis marks at 25/50/75 */}
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
        {/* Background wedges */}
        {wedges.map((w, i) => (
          <path
            key={`bg-${i}`}
            d={wedgePath(w.start, w.end, R_OUTER)}
            fill={accent}
            opacity={0.05}
          />
        ))}
        {/* Filled wedges */}
        {wedges.map((w, i) => {
          const opacity = hover == null ? 0.78 : hover === i ? 0.95 : 0.4
          return (
            <path
              key={`fg-${i}`}
              d={wedgePath(w.start, w.end, w.r)}
              fill={accent}
              opacity={opacity}
              stroke={accent}
              strokeWidth={0.8}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
            />
          )
        })}
        {/* Value labels on each wedge */}
        {wedges.map((w, i) => {
          if (w.pct < 12) return null
          const [tx, ty] = polar(w.mid, Math.max(18, w.r * 0.6))
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
              {w.spoke.label}
            </text>
          )
        })}
      </svg>

      {/* Hover detail */}
      <div className="mt-2 text-center min-h-[2.5rem]">
        {activeSpoke ? (
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-2">
              {activeSpoke.label}
            </div>
            <div className="text-sm font-mono tnum text-fg">
              {activeSpoke.value == null ? '—' : `${activeSpoke.value}%`}
            </div>
            <div className="text-2xs text-muted-2 mt-0.5">{activeSpoke.sub}</div>
          </div>
        ) : (
          <div className="text-2xs uppercase tracking-wider text-muted-2">
            hover for detail
          </div>
        )}
      </div>
    </div>
  )
}
