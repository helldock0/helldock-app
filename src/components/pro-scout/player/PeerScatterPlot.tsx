'use client'

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  CHART_AXIS,
  CHART_COLORS,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
} from '@/components/charts/chartTheme'
import type { PeerScatterPoint } from '@/lib/pro-scout/types'

export default function PeerScatterPlot({
  points,
  height = 360,
  accent = CHART_COLORS.gold,
}: {
  points: PeerScatterPoint[]
  height?: number
  /** Color used to highlight the focal player dot. Defaults to gold. */
  accent?: string
}) {
  if (points.length < 3) {
    return <p className="text-sm text-muted-2">need 3+ peers to plot</p>
  }

  const peers = points.filter((p) => !p.isFocal)
  const focal = points.filter((p) => p.isFocal)

  // Domains with a little padding
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xMin = Math.floor(Math.min(...xs) * 10) / 10 - 0.05
  const xMax = Math.ceil(Math.max(...xs) * 10) / 10 + 0.05
  const yMin = Math.floor(Math.min(...ys) / 10) * 10 - 5
  const yMax = Math.ceil(Math.max(...ys) / 10) * 10 + 5

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 24 }}>
          <CartesianGrid {...CHART_GRID} />
          <XAxis
            type="number"
            dataKey="x"
            name="K/D"
            domain={[xMin, xMax]}
            {...CHART_AXIS}
            label={{
              value: 'K / D',
              position: 'insideBottom',
              offset: -10,
              fill: CHART_COLORS.muted2,
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="ACS"
            domain={[yMin, yMax]}
            {...CHART_AXIS}
            label={{
              value: 'ACS',
              position: 'insideLeft',
              angle: -90,
              offset: 12,
              fill: CHART_COLORS.muted2,
              fontSize: 11,
            }}
          />
          <ZAxis dataKey="maps" range={[40, 200]} name="maps" />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.lineStrong }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as PeerScatterPoint
              return (
                <div
                  style={CHART_TOOLTIP_STYLE}
                  className="text-xs"
                >
                  <div className="font-bold text-fg">{p.ign}</div>
                  <div className="text-muted-2">{p.teamName ?? '—'}{p.primaryRole ? ` · ${p.primaryRole}` : ''}</div>
                  <div className="font-mono tnum mt-1">
                    ACS {p.y} · K/D {p.x.toFixed(2)} · {p.maps} maps
                  </div>
                </div>
              )
            }}
          />
          <Scatter
            name="peers"
            data={peers}
            fill={CHART_COLORS.muted2}
            fillOpacity={0.55}
            isAnimationActive={false}
          />
          {focal.length > 0 && (
            <Scatter
              name="focal"
              data={focal}
              fill={accent}
              stroke={CHART_COLORS.fg}
              strokeWidth={2}
              isAnimationActive={false}
              shape="circle"
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
