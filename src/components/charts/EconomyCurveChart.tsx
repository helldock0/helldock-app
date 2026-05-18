'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { CHART_COLORS, CHART_AXIS, CHART_GRID, CHART_TOOLTIP_STYLE } from './chartTheme'

type RoundEconLite = {
  round_num: number
  our_econ: number | null
  their_econ: number | null
}

export default function EconomyCurveChart({ rounds }: { rounds: RoundEconLite[] }) {
  const data = [...rounds]
    .sort((a, b) => a.round_num - b.round_num)
    .map((r) => ({
      round: r.round_num,
      ours: r.our_econ ?? null,
      theirs: r.their_econ ?? null,
    }))
    .filter((d) => d.ours != null || d.theirs != null)

  if (data.length === 0) {
    return (
      <div className="text-xs text-muted-2 px-1 py-4">
        no economy data — import or rehydrate from Henrik to populate
      </div>
    )
  }

  return (
    <div className="w-full h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="econOurs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.gold} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_COLORS.gold} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="econTheirs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.crimson} stopOpacity={0.32} />
              <stop offset="100%" stopColor={CHART_COLORS.crimson} stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ stroke: CHART_COLORS.lineStrong }}
            labelFormatter={(l) => `Round ${l}`}
            formatter={(value: unknown) =>
              typeof value === 'number' ? value.toLocaleString() : String(value ?? '—')
            }
          />
          <Legend wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }} iconSize={8} />
          <Area
            type="monotone"
            dataKey="ours"
            name="our econ"
            stroke={CHART_COLORS.gold}
            strokeWidth={1.5}
            fill="url(#econOurs)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="theirs"
            name="their econ"
            stroke={CHART_COLORS.crimson}
            strokeWidth={1.5}
            fill="url(#econTheirs)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
