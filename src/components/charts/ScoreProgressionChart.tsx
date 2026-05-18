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

type RoundLite = {
  round_num: number
  outcome: string | null
}

export default function ScoreProgressionChart({ rounds }: { rounds: RoundLite[] }) {
  const sorted = [...rounds].sort((a, b) => a.round_num - b.round_num)

  let ours = 0
  let theirs = 0
  const data = sorted.map((r) => {
    if (r.outcome === 'W') ours++
    else if (r.outcome === 'L') theirs++
    return { round: r.round_num, ours, theirs }
  })

  if (data.length === 0) {
    return (
      <div className="text-xs text-muted-2 px-1 py-4">no round outcomes yet</div>
    )
  }

  const maxScore = Math.max(13, ours, theirs)

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
          <YAxis {...CHART_AXIS} domain={[0, maxScore]} allowDecimals={false} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ stroke: CHART_COLORS.lineStrong }}
            labelFormatter={(l) => `Round ${l}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }}
            iconSize={8}
          />
          <ReferenceLine y={13} stroke={CHART_COLORS.lineStrong} strokeDasharray="2 4" />
          <Line
            type="monotone"
            dataKey="ours"
            name="ours"
            stroke={CHART_COLORS.gold}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="theirs"
            name="theirs"
            stroke={CHART_COLORS.crimson}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
