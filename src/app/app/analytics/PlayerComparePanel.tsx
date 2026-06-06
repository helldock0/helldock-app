'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { PlayerStat } from '@/lib/analytics'

type MetricDef = {
  key: string
  label: string
  left: number | null
  right: number | null
  format: (value: number | null) => string
  higherIsBetter?: boolean
}

const fmtNum = (value: number | null, digits = 1) =>
  value == null ? '-' : value.toFixed(digits).replace(/\.0$/, '')

const fmtPct = (value: number | null) => (value == null ? '-' : `${fmtNum(value, 1)}%`)
const fmtSigned = (value: number | null, suffix = '') =>
  value == null ? '-' : `${value > 0 ? '+' : ''}${fmtNum(value, 1)}${suffix}`

export default function PlayerComparePanel({ players }: { players: PlayerStat[] }) {
  const ranked = useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          (b.avgAcs ?? -Infinity) - (a.avgAcs ?? -Infinity) ||
          a.name.localeCompare(b.name)
      ),
    [players]
  )

  const [leftId, setLeftId] = useState(ranked[0]?.playerId ?? '')
  const [rightId, setRightId] = useState(ranked[1]?.playerId ?? ranked[0]?.playerId ?? '')

  useEffect(() => {
    if (!ranked.length) return

    setLeftId((current) =>
      ranked.some((p) => p.playerId === current) ? current : ranked[0].playerId
    )
    setRightId((current) => {
      if (ranked.some((p) => p.playerId === current) && current !== leftId) return current
      return ranked.find((p) => p.playerId !== leftId)?.playerId ?? ranked[0].playerId
    })
  }, [leftId, ranked])

  if (ranked.length < 2) return null

  const left = ranked.find((p) => p.playerId === leftId) ?? ranked[0]
  const right =
    ranked.find((p) => p.playerId === rightId && p.playerId !== left.playerId) ??
    ranked.find((p) => p.playerId !== left.playerId) ??
    ranked[1]

  const metrics = buildMetrics(left, right)
  const score = scoreMetrics(metrics)
  const reads = buildReads(left, right, metrics)

  return (
    <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">1v1 player compare</h2>
          <p className="text-xs text-muted mt-1">
            Head-to-head from the current analytics scope.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 sm:items-center lg:min-w-[520px]">
          <PlayerSelect
            label="Player A"
            value={left.playerId}
            players={ranked}
            blockedId={right.playerId}
            onChange={setLeftId}
          />
          <div className="hidden sm:block text-center text-2xs uppercase tracking-[0.16em] text-muted-2 px-1">
            vs
          </div>
          <PlayerSelect
            label="Player B"
            value={right.playerId}
            players={ranked}
            blockedId={left.playerId}
            onChange={setRightId}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] items-start gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PlayerSummary player={left} wins={score.leftWins} total={score.scored} />
          <PlayerSummary player={right} wins={score.rightWins} total={score.scored} />
        </div>

        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_1fr] border-b border-line bg-surface-3/50 text-2xs uppercase tracking-[0.14em] text-muted-2">
            <div className="px-3 py-2 truncate">{left.name}</div>
            <div className="px-3 py-2 text-center">Metric</div>
            <div className="px-3 py-2 text-right truncate">{right.name}</div>
          </div>
          <div className="divide-y divide-line">
            {metrics.map((metric) => (
              <MetricRow key={metric.key} metric={metric} />
            ))}
          </div>
        </div>
      </div>

      {reads.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {reads.map((read) => (
            <div
              key={read}
              className="bg-surface border border-line rounded-xl px-3 py-2 text-xs text-fg"
            >
              {read}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PlayerSelect({
  label,
  value,
  players,
  blockedId,
  onChange,
}: {
  label: string
  value: string
  players: PlayerStat[]
  blockedId: string
  onChange: (id: string) => void
}) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-[0.14em] text-muted-2 mb-1">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2 text-sm text-fg outline-none focus:border-gold"
      >
        {players.map((player) => (
          <option key={player.playerId} value={player.playerId} disabled={player.playerId === blockedId}>
            {player.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function PlayerSummary({
  player,
  wins,
  total,
}: {
  player: PlayerStat
  wins: number
  total: number
}) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-fg font-semibold">{player.name}</div>
          <div className="text-2xs text-muted-2 mt-1">
            {player.games} games
            {player.topAgent ? ` | ${player.topAgent.agent} x${player.topAgent.count}` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="text-gold font-bold tnum">
            {total > 0 ? `${wins}/${total}` : '-'}
          </div>
          <div className="text-2xs text-muted-2 uppercase tracking-[0.12em]">edges</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Mini label="ACS" value={fmtNum(player.avgAcs)} />
        <Mini label="ADR" value={fmtNum(player.avgAdr)} />
        <Mini label="Rating" value={fmtNum(player.rating2, 2)} />
      </div>
      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="text-xs text-muted truncate">
          {player.bestMap
            ? `${player.bestMap.map} ${fmtPct(player.bestMap.winPct)}`
            : 'No map edge yet'}
        </div>
        <Link
          href={`/app/players/${encodeURIComponent(player.playerId)}`}
          className="text-2xs uppercase tracking-wider text-muted-2 hover:text-gold transition-colors"
        >
          profile
        </Link>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-lg px-2 py-1.5">
      <div className="text-2xs uppercase tracking-[0.12em] text-muted-2">{label}</div>
      <div className="text-sm text-fg font-semibold tnum">{value}</div>
    </div>
  )
}

function MetricRow({ metric }: { metric: MetricDef }) {
  const winner = pickWinner(metric)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center text-sm">
      <div className={`px-3 py-2 tnum ${winner === 'left' ? 'text-gold font-semibold' : 'text-fg'}`}>
        {metric.format(metric.left)}
      </div>
      <div className="px-3 py-2 text-center text-xs text-muted">{metric.label}</div>
      <div className={`px-3 py-2 text-right tnum ${winner === 'right' ? 'text-gold font-semibold' : 'text-fg'}`}>
        {metric.format(metric.right)}
      </div>
    </div>
  )
}

function buildMetrics(left: PlayerStat, right: PlayerStat): MetricDef[] {
  return [
    { key: 'avgAcs', label: 'Avg ACS', left: left.avgAcs, right: right.avgAcs, format: fmtNum },
    { key: 'adr', label: 'ADR', left: left.avgAdr, right: right.avgAdr, format: fmtNum },
    { key: 'kd', label: 'K/D', left: left.avgKd, right: right.avgKd, format: (v) => fmtNum(v, 2) },
    { key: 'pm', label: '+/-', left: left.avgPlusMinus, right: right.avgPlusMinus, format: fmtSigned },
    { key: 'rating', label: 'Rating', left: left.rating2, right: right.rating2, format: (v) => fmtNum(v, 2) },
    { key: 'kst', label: 'KST%', left: left.kstPct, right: right.kstPct, format: fmtPct },
    { key: 'opduel', label: 'OpDuel', left: left.opDuelWPct, right: right.opDuelWPct, format: fmtPct },
    { key: 'fk', label: 'FK / game', left: left.avgFk, right: right.avgFk, format: fmtNum },
    { key: 'fd', label: 'FD / game', left: left.avgFd, right: right.avgFd, format: fmtNum, higherIsBetter: false },
    { key: 'trade', label: 'Trade%', left: left.tradeRate, right: right.tradeRate, format: fmtPct },
    { key: 'carry', label: 'Kill impact', left: left.carry, right: right.carry, format: (v) => fmtSigned(v, 'pp') },
    { key: 'lev', label: 'Leverage', left: left.levCarry, right: right.levCarry, format: (v) => fmtSigned(v) },
    { key: 'stdev', label: 'ACS stdev', left: left.acsStdev, right: right.acsStdev, format: fmtNum, higherIsBetter: false },
    { key: 'form', label: '7d form', left: left.acsDelta7d, right: right.acsDelta7d, format: (v) => fmtSigned(v) },
  ]
}

function pickWinner(metric: MetricDef): 'left' | 'right' | 'tie' {
  if (metric.left == null || metric.right == null || metric.left === metric.right) return 'tie'
  const higherIsBetter = metric.higherIsBetter ?? true
  const leftIsHigher = metric.left > metric.right
  return leftIsHigher === higherIsBetter ? 'left' : 'right'
}

function scoreMetrics(metrics: MetricDef[]) {
  let leftWins = 0
  let rightWins = 0
  let scored = 0

  for (const metric of metrics) {
    const winner = pickWinner(metric)
    if (winner === 'tie') continue
    scored++
    if (winner === 'left') leftWins++
    else rightWins++
  }

  return { leftWins, rightWins, scored }
}

function buildReads(left: PlayerStat, right: PlayerStat, metrics: MetricDef[]): string[] {
  const reads: string[] = []
  const acsWinner = winnerName('avgAcs', left, right, metrics, 15)
  if (acsWinner) reads.push(`${acsWinner} has the fragging edge by 15+ ACS.`)

  const entryWinner = winnerName('opduel', left, right, metrics, 10)
  if (entryWinner) reads.push(`${entryWinner} is stronger in opening duels.`)

  const stableWinner = winnerName('stdev', left, right, metrics, 10)
  if (stableWinner) reads.push(`${stableWinner} has the steadier ACS profile.`)

  const formWinner = winnerName('form', left, right, metrics, 20)
  if (formWinner) reads.push(`${formWinner} is hotter in the last 7 days.`)

  if (reads.length === 0) {
    reads.push('This matchup is close; use map, agent, and role fit to decide.')
  }

  return reads.slice(0, 3)
}

function winnerName(
  metricKey: string,
  left: PlayerStat,
  right: PlayerStat,
  metrics: MetricDef[],
  minGap: number
): string | null {
  const metric = metrics.find((m) => m.key === metricKey)
  if (!metric || metric.left == null || metric.right == null) return null
  if (Math.abs(metric.left - metric.right) < minGap) return null
  const winner = pickWinner(metric)
  if (winner === 'left') return left.name
  if (winner === 'right') return right.name
  return null
}
