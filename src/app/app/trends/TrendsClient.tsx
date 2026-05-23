'use client'

import Link from 'next/link'
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
import {
  CHART_COLORS,
  CHART_AXIS,
  CHART_GRID,
  CHART_TOOLTIP_STYLE,
} from '@/components/charts/chartTheme'
import type {
  RollingWinPoint,
  WeeklySidePoint,
  PlayerAcsTrend,
  Streaks,
  WeeklyRetro,
} from '@/lib/trends'
import type { LeverageMoment } from '@/lib/role-impact'

// Stable per-player color (deterministic hash → CSS HSL)
function colorForPlayer(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  }
  const hue = Math.abs(h) % 360
  return `hsl(${hue}, 60%, 60%)`
}

function fmtShort(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return d
  }
}

function deltaStr(d: number | null, suffix = ''): string {
  if (d == null) return '—'
  if (d === 0) return `±0${suffix}`
  return d > 0 ? `▲ +${d}${suffix}` : `▼ ${d}${suffix}`
}
function deltaTone(d: number | null): string {
  if (d == null || d === 0) return 'text-muted-2'
  return d > 0 ? 'text-win-green' : 'text-crimson'
}

export default function TrendsClient({
  rolling,
  sideWeekly,
  playerTrends,
  streaks,
  retro,
  totalMatches,
  highestLeverageMoment,
  children,
}: {
  rolling: RollingWinPoint[]
  sideWeekly: WeeklySidePoint[]
  playerTrends: PlayerAcsTrend[]
  streaks: Streaks
  retro: WeeklyRetro
  totalMatches: number
  highestLeverageMoment: LeverageMoment | null
  children?: React.ReactNode
}) {
  // Build the player ACS series data — interleaved by date
  // Each row = { date, [playerName]: avgAcs }
  const allDates = Array.from(
    new Set(playerTrends.flatMap((p) => p.buckets.map((b) => b.date)))
  ).sort()
  const playerSeriesData = allDates.map((date) => {
    const row: Record<string, string | number | null> = { date }
    for (const p of playerTrends) {
      const bucket = p.buckets.find((b) => b.date === date)
      row[p.name] = bucket ? bucket.avgAcs : null
    }
    return row
  })

  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
          time series
        </p>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-fg leading-tight">Trends</h1>
          <span className="text-xs text-muted tnum">{totalMatches} matches</span>
        </div>
      </div>

      {/* Scalar cards: streaks + retro */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {/* Streaks */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-3">
            streaks
          </p>
          <div className="flex items-baseline gap-6">
            <div>
              <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">
                Current
              </div>
              <div
                className={`text-3xl font-bold tnum ${
                  streaks.current.kind === 'W'
                    ? 'text-win-green'
                    : streaks.current.kind === 'L'
                    ? 'text-crimson'
                    : 'text-muted-2'
                }`}
              >
                {streaks.current.kind === 'none'
                  ? '—'
                  : `${streaks.current.length}${streaks.current.kind}`}
              </div>
            </div>
            <div>
              <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">
                Longest W
              </div>
              <div className="text-2xl font-bold tnum text-win-green">
                {streaks.longestWin}
              </div>
            </div>
            <div>
              <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">
                Longest L
              </div>
              <div className="text-2xl font-bold tnum text-crimson">
                {streaks.longestLoss}
              </div>
            </div>
          </div>
        </section>

        {/* Weekly retro */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-3">
            last 7 days vs prior 7 days
          </p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <RetroLine
              label="Matches"
              value={retro.current.matches}
              delta={retro.delta.matches}
            />
            <RetroLine
              label="Win %"
              value={
                retro.current.winPct == null ? '—' : `${retro.current.winPct}%`
              }
              delta={retro.delta.winPct}
              suffix="%"
            />
            <RetroLine
              label="ATT %"
              value={
                retro.current.attPct == null ? '—' : `${retro.current.attPct}%`
              }
              delta={retro.delta.attPct}
              suffix="%"
            />
            <RetroLine
              label="DEF %"
              value={
                retro.current.defPct == null ? '—' : `${retro.current.defPct}%`
              }
              delta={retro.delta.defPct}
              suffix="%"
            />
            <RetroLine
              label="Top frag ACS"
              value={
                retro.current.topFragger
                  ? `${retro.current.topFragger.avgAcs} (${retro.current.topFragger.name})`
                  : '—'
              }
              delta={retro.delta.topFraggerAcs}
            />
          </div>
        </section>
      </div>

      {/* S26 — Highest-leverage moment of the last 7 days */}
      {highestLeverageMoment && (
        <section className="bg-surface-2 border border-gold/40 rounded-2xl p-5 mb-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-2xs uppercase tracking-[0.16em] text-gold mb-1">
                ⚡ Highest-leverage moment · last 7 days
              </p>
              <h2 className="text-xl font-bold text-fg leading-tight">
                {highestLeverageMoment.name} ·{' '}
                <span className="text-gold">{highestLeverageMoment.kind}</span>{' '}
                vs {highestLeverageMoment.opponent ?? '—'}
              </h2>
              <p className="text-xs text-muted mt-1">
                <Link
                  href={`/app/matches/${highestLeverageMoment.matchIdHelldock}?tab=Review&round=${highestLeverageMoment.round_num}`}
                  className="font-mono text-gold hover:underline"
                >
                  {highestLeverageMoment.matchIdHelldock}
                </Link>{' '}
                · Round {highestLeverageMoment.round_num} · pre-round WP{' '}
                <span className="tnum text-fg">
                  {highestLeverageMoment.wpPctBefore}%
                </span>{' '}
                · outcome{' '}
                <span
                  className={
                    highestLeverageMoment.outcome === 'W'
                      ? 'text-win-green font-bold'
                      : 'text-crimson font-bold'
                  }
                >
                  {highestLeverageMoment.outcome}
                </span>
              </p>
            </div>
            <div className="text-right">
              <div
                className={`text-3xl font-bold tnum ${
                  highestLeverageMoment.signedScore >= 0
                    ? 'text-gold'
                    : 'text-crimson'
                }`}
              >
                {highestLeverageMoment.signedScore >= 0 ? '+' : ''}
                {highestLeverageMoment.signedScore.toFixed(2)}
              </div>
              <div className="text-2xs uppercase tracking-wider text-muted-2">
                leverage × weight
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Rolling win rate chart */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
              30-day rolling
            </p>
            <h2 className="text-lg font-semibold text-fg">Win rate curve</h2>
          </div>
          <span className="text-2xs uppercase tracking-wider text-muted-2">
            <span className="text-gold">overall</span> ·{' '}
            <span className="text-win-green">scrim only</span>
          </span>
        </div>
        {rolling.length < 2 ? (
          <div className="text-xs text-muted-2 py-6 text-center">
            need 2+ match dates to draw a curve
          </div>
        ) : (
          <div className="w-full" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rolling}
                margin={{ top: 6, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  dataKey="date"
                  {...CHART_AXIS}
                  tickFormatter={fmtShort}
                  minTickGap={24}
                />
                <YAxis
                  {...CHART_AXIS}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ stroke: CHART_COLORS.lineStrong }}
                  labelFormatter={(l: unknown) =>
                    typeof l === 'string' ? fmtShort(l) : String(l ?? '')
                  }
                  formatter={(v: unknown, name: unknown) => {
                    const text =
                      typeof v === 'number' ? `${v}%` : String(v ?? '—')
                    const label =
                      name === 'overallPct'
                        ? 'overall'
                        : name === 'scrimPct'
                        ? 'scrim only'
                        : String(name ?? '')
                    return [text, label] as [string, string]
                  }}
                />
                <ReferenceLine
                  y={50}
                  stroke={CHART_COLORS.muted2}
                  strokeDasharray="2 4"
                />
                <Line
                  type="monotone"
                  dataKey="overallPct"
                  stroke={CHART_COLORS.gold}
                  strokeWidth={2}
                  dot={{ r: 2, fill: CHART_COLORS.gold, strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="scrimPct"
                  stroke={CHART_COLORS.winGreen}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Weekly side bias drift */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
              per-week ATT vs DEF
            </p>
            <h2 className="text-lg font-semibold text-fg">Side bias drift</h2>
          </div>
          <span className="text-2xs uppercase tracking-wider text-muted-2">
            <span className="text-gold">ATT</span> ·{' '}
            <span className="text-crimson">DEF</span>
          </span>
        </div>
        {sideWeekly.length < 2 ? (
          <div className="text-xs text-muted-2 py-6 text-center">
            need 2+ weeks of round data to draw a drift line
          </div>
        ) : (
          <div className="w-full" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sideWeekly}
                margin={{ top: 6, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid {...CHART_GRID} />
                <XAxis
                  dataKey="weekStart"
                  {...CHART_AXIS}
                  tickFormatter={fmtShort}
                  minTickGap={24}
                />
                <YAxis
                  {...CHART_AXIS}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ stroke: CHART_COLORS.lineStrong }}
                  labelFormatter={(l: unknown) =>
                    typeof l === 'string' ? `week of ${fmtShort(l)}` : String(l ?? '')
                  }
                  formatter={(v: unknown, name: unknown) => {
                    const text =
                      typeof v === 'number' ? `${v}%` : String(v ?? '—')
                    const label =
                      name === 'attPct'
                        ? 'ATT %'
                        : name === 'defPct'
                        ? 'DEF %'
                        : String(name ?? '')
                    return [text, label] as [string, string]
                  }}
                />
                <ReferenceLine
                  y={50}
                  stroke={CHART_COLORS.muted2}
                  strokeDasharray="2 4"
                />
                <Line
                  type="monotone"
                  dataKey="attPct"
                  stroke={CHART_COLORS.gold}
                  strokeWidth={2}
                  dot={{ r: 2, fill: CHART_COLORS.gold, strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="defPct"
                  stroke={CHART_COLORS.crimson}
                  strokeWidth={2}
                  dot={{ r: 2, fill: CHART_COLORS.crimson, strokeWidth: 0 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Player ACS trajectory */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
              5-match rolling buckets
            </p>
            <h2 className="text-lg font-semibold text-fg">
              Player ACS trajectory
            </h2>
          </div>
        </div>
        {playerSeriesData.length < 2 ? (
          <div className="text-xs text-muted-2 py-6 text-center">
            need 2+ buckets of player ACS data
          </div>
        ) : (
          <>
            <div className="w-full" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={playerSeriesData}
                  margin={{ top: 6, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis
                    dataKey="date"
                    {...CHART_AXIS}
                    tickFormatter={fmtShort}
                    minTickGap={24}
                  />
                  <YAxis {...CHART_AXIS} />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ stroke: CHART_COLORS.lineStrong }}
                    labelFormatter={(l: unknown) =>
                      typeof l === 'string' ? fmtShort(l) : String(l ?? '')
                    }
                  />
                  <Legend
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: CHART_COLORS.muted }}
                  />
                  {playerTrends.map((p) => (
                    <Line
                      key={p.playerId}
                      type="monotone"
                      dataKey={p.name}
                      stroke={colorForPlayer(p.name)}
                      strokeWidth={1.6}
                      dot={{ r: 1.8, strokeWidth: 0 }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Trend chips */}
            <div className="mt-4 pt-3 border-t border-line">
              <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
                trend vs all-time avg
              </p>
              <div className="flex flex-wrap gap-1.5">
                {playerTrends.map((p) => {
                  const tone =
                    p.trend === 'improving'
                      ? 'bg-win-green/15 text-win-green border-win-green/40'
                      : p.trend === 'declining'
                      ? 'bg-crimson/15 text-crimson border-crimson/40'
                      : 'bg-surface text-muted border-line-strong'
                  const arrow =
                    p.trend === 'improving'
                      ? '▲'
                      : p.trend === 'declining'
                      ? '▼'
                      : '–'
                  return (
                    <span
                      key={p.playerId}
                      className={`text-2xs px-2 py-0.5 rounded border ${tone}`}
                      title={`avg ${p.allTimeAvg ?? '—'} ACS · last bucket Δ${p.trendDelta ?? 0}%`}
                    >
                      {arrow} {p.name}{' '}
                      <span className="text-muted-2">
                        {p.trendDelta != null
                          ? `${p.trendDelta > 0 ? '+' : ''}${p.trendDelta}%`
                          : '—'}
                      </span>
                    </span>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </section>

      {children && <div className="mt-6">{children}</div>}
    </main>
  )
}

function RetroLine({
  label,
  value,
  delta,
  suffix = '',
}: {
  label: string
  value: string | number
  delta: number | null
  suffix?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-2 text-2xs uppercase tracking-wider">
        {label}
      </span>
      <span className="text-fg tnum">
        {value}{' '}
        <span className={`text-2xs ml-1 ${deltaTone(delta)}`}>
          {deltaStr(delta, suffix)}
        </span>
      </span>
    </div>
  )
}
