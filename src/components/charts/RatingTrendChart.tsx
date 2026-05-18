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
} from 'recharts'
import { CHART_COLORS, CHART_AXIS, CHART_GRID, CHART_TOOLTIP_STYLE } from './chartTheme'

export type RatingPoint = {
  date: string // ISO yyyy-mm-dd
  rating: number
  label?: string // e.g. "Bind · vs Team Nexus · W"
}

function formatTickDate(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return d
  }
}

export default function RatingTrendChart({
  points,
  height = 160,
}: {
  points: RatingPoint[]
  height?: number
}) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) {
    return (
      <div className="text-xs text-muted-2 px-1 py-3">
        need 2+ matches with rating data to draw a trend
      </div>
    )
  }

  const ratings = sorted.map((p) => p.rating)
  const yMin = Math.max(0, Math.floor(Math.min(...ratings) * 10) / 10 - 0.1)
  const yMax = Math.ceil(Math.max(...ratings) * 10) / 10 + 0.1
  const avg =
    Math.round((ratings.reduce((s, v) => s + v, 0) / ratings.length) * 100) / 100

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={sorted}
          margin={{ top: 6, right: 12, left: -16, bottom: 0 }}
        >
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            dataKey="date"
            {...CHART_AXIS}
            tickFormatter={formatTickDate}
            minTickGap={24}
          />
          <YAxis
            {...CHART_AXIS}
            domain={[yMin, yMax]}
            tickFormatter={(v: number) => v.toFixed(2)}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            cursor={{ stroke: CHART_COLORS.lineStrong }}
            labelFormatter={(l: unknown) =>
              typeof l === 'string' ? formatTickDate(l) : String(l ?? '')
            }
            formatter={(v: unknown, _name: unknown, item: unknown) => {
              const lab = ((item as { payload?: RatingPoint } | undefined)?.payload as RatingPoint | undefined)?.label
              const text = typeof v === 'number' ? v.toFixed(2) : String(v ?? '—')
              return [text, lab ?? 'rating'] as [string, string]
            }}
          />
          <ReferenceLine
            y={avg}
            stroke={CHART_COLORS.muted2}
            strokeDasharray="2 4"
            label={{
              value: `avg ${avg}`,
              position: 'right',
              fill: CHART_COLORS.muted2,
              fontSize: 10,
            }}
          />
          <Line
            type="monotone"
            dataKey="rating"
            stroke={CHART_COLORS.gold}
            strokeWidth={2}
            dot={{ r: 2.5, fill: CHART_COLORS.gold, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
