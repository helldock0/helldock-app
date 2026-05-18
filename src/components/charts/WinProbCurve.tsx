'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts'
import {
  CHART_COLORS,
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
} from './chartTheme'

export type WPPoint = {
  round_num: number
  wpPct: number
  outcome: string | null
}

/**
 * Plots pre-round predicted win probability across the match. Highlights
 * "anti-strat surprises": rounds where outcome differed from the model's
 * expectation by >25pp. Gold dot = unexpected W, crimson dot = unexpected L.
 */
export default function WinProbCurve({ points }: { points: WPPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="text-xs text-muted-2 px-1 py-3">
        need 2+ rounds with outcomes to draw the WP curve
      </div>
    )
  }
  const sorted = [...points].sort((a, b) => a.round_num - b.round_num)
  const data = sorted.map((p) => ({ round: p.round_num, wp: p.wpPct }))

  const surprises = sorted.filter((p) => {
    if (p.outcome !== 'W' && p.outcome !== 'L') return false
    const expected = p.wpPct >= 50 ? 'W' : 'L'
    if (p.outcome === expected) return false
    const actualScore = p.outcome === 'W' ? 100 : 0
    return Math.abs(actualScore - p.wpPct) > 25
  })

  return (
    <div className="w-full h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: -10, bottom: 0 }}
        >
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="round"
            {...CHART_AXIS}
            label={{
              value: 'round',
              position: 'insideBottom',
              offset: -2,
              fill: CHART_COLORS.muted2,
              fontSize: 10,
            }}
          />
          <YAxis
            {...CHART_AXIS}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ stroke: CHART_COLORS.lineStrong }}
            labelFormatter={(l) => `Round ${l}`}
            formatter={(v: unknown) => {
              const num = typeof v === 'number' ? v : Number(v)
              return [`${num}%`, 'predicted W%']
            }}
          />
          <ReferenceLine
            y={50}
            stroke={CHART_COLORS.muted2}
            strokeDasharray="2 4"
          />
          <Line
            type="monotone"
            dataKey="wp"
            stroke={CHART_COLORS.gold}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {surprises.map((p) => (
            <ReferenceDot
              key={p.round_num}
              x={p.round_num}
              y={p.wpPct}
              r={4}
              fill={p.outcome === 'W' ? CHART_COLORS.winGreen : CHART_COLORS.crimson}
              stroke={p.outcome === 'W' ? CHART_COLORS.winGreen : CHART_COLORS.crimson}
              ifOverflow="extendDomain"
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
