'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts'
import { CHART_COLORS, CHART_AXIS, CHART_GRID, CHART_TOOLTIP_STYLE } from './chartTheme'

export type UltPoint = {
  round: number
  ours: number | null
  theirs: number | null
  sample: number
}

export default function UltCastsChart({ points }: { points: UltPoint[] }) {
  const data = [...points].sort((a, b) => a.round - b.round)
  const hasAny = data.some((p) => p.ours != null || p.theirs != null)

  if (!hasAny) {
    return (
      <div className="text-xs text-muted-2 px-1 py-4">
        no ult-cast data yet — rehydrate matches to populate per-round ult counts
      </div>
    )
  }

  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
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
            allowDecimals
            domain={[0, 'auto']}
            tickFormatter={(v: number) => (Number.isFinite(v) ? v.toFixed(1) : '')}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ stroke: CHART_COLORS.lineStrong }}
            labelFormatter={(l) => `Round ${l}`}
            formatter={(v: unknown) =>
              typeof v === 'number' ? v.toFixed(2) : String(v ?? '—')
            }
          />
          <Legend wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }} iconSize={8} />
          <ReferenceLine y={0} stroke={CHART_COLORS.lineStrong} />
          <Line
            type="monotone"
            dataKey="ours"
            name="our ults"
            stroke={CHART_COLORS.gold}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART_COLORS.gold, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="theirs"
            name="their ults"
            stroke={CHART_COLORS.crimson}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART_COLORS.crimson, strokeWidth: 0 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
