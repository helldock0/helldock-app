'use client'

// Tiny map-result trajectory. One point per map in chronological order, value
// is a rolling W% (default 5-map window). Reads like a heart-rate trace —
// scan once to see if the team is climbing or fading.

import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CHART_AXIS,
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
} from '@/components/charts/chartTheme'
import type { ProDossierMatch } from '@/lib/pro-scout/types'

type Point = {
  idx: number
  date: string | null
  rolling: number
  mapName: string
  result: 'W' | 'L'
  team: number
  opp: number
}

function buildPoints(matches: ProDossierMatch[], window: number): Point[] {
  // Flatten matches → maps in ascending date order
  const items: { date: string | null; mapName: string; team: number; opp: number; w: number }[] = []
  const ordered = [...matches].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  for (const m of ordered) {
    for (const mp of m.maps) {
      const w = mp.teamScore > mp.oppScore ? 1 : 0
      items.push({
        date: m.date,
        mapName: mp.mapName,
        team: mp.teamScore,
        opp: mp.oppScore,
        w,
      })
    }
  }
  const points: Point[] = []
  for (let i = 0; i < items.length; i++) {
    const lo = Math.max(0, i - window + 1)
    const window_ = items.slice(lo, i + 1)
    const wins = window_.reduce((s, it) => s + it.w, 0)
    const rolling = Math.round((wins / window_.length) * 100)
    const it = items[i]
    points.push({
      idx: i,
      date: it.date,
      rolling,
      mapName: it.mapName,
      result: it.w ? 'W' : 'L',
      team: it.team,
      opp: it.opp,
    })
  }
  return points
}

export default function FormSparkline({
  matches,
  accent = CHART_COLORS.gold,
  height = 64,
}: {
  matches: ProDossierMatch[]
  accent?: string
  height?: number
}) {
  const points = buildPoints(matches, 5)
  if (points.length < 3) {
    return null
  }
  const latest = points[points.length - 1].rolling
  const first = points[0].rolling
  const delta = latest - first

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1 text-2xs uppercase tracking-wider text-muted-2">
        <span>Form (5-map rolling W%)</span>
        <span className="tnum">
          <span className="text-fg font-mono font-bold mr-1">{latest}%</span>
          <span
            className={
              delta > 0 ? 'text-win-green' : delta < 0 ? 'text-crimson' : 'text-muted-2'
            }
          >
            {delta > 0 ? '+' : ''}{delta}pp
          </span>
        </span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="formGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.65} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="idx" hide />
            <YAxis domain={[0, 100]} hide />
            <ReferenceLine y={50} stroke={CHART_COLORS.lineStrong} strokeDasharray="2 4" />
            <Tooltip
              cursor={{ stroke: CHART_COLORS.lineStrong }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as Point
                return (
                  <div style={CHART_TOOLTIP_STYLE} className="text-xs">
                    <div className="font-bold text-fg">
                      {p.mapName} <span className={p.result === 'W' ? 'text-win-green' : 'text-crimson'}>{p.result}</span>
                    </div>
                    <div className="font-mono tnum text-muted">
                      {p.team}-{p.opp} · rolling {p.rolling}%
                    </div>
                    {p.date && <div className="text-2xs text-muted-2 tnum">{p.date}</div>}
                  </div>
                )
              }}
              {...CHART_AXIS}
            />
            <Area
              type="monotone"
              dataKey="rolling"
              stroke={accent}
              strokeWidth={1.8}
              fill="url(#formGrad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
