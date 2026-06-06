'use client'

import Link from 'next/link'
import type {
  CoachSummary,
  MapPoolEntry,
  OppStat,
  PlayerStat,
  RoundCell,
  RoundStats,
} from '@/lib/analytics'
import type { GemsBundle } from './GemsTab'
import { cleanOpponentName } from '@/lib/opponent-name'

function recordStr(r: { wins: number; losses: number }): string {
  if (r.wins === 0 && r.losses === 0) return '-'
  return `${r.wins}-${r.losses}`
}

function pctCell(cell: RoundCell): string {
  return cell.winPct == null ? '-' : `${cell.winPct}%`
}

function pointDelta(a: number | null, b: number | null): string {
  if (a == null || b == null) return '-'
  const delta = Math.round((a - b) * 10) / 10
  return `${delta > 0 ? '+' : ''}${delta} pts`
}

function cardTone(tone: 'gold' | 'green' | 'crimson' | 'muted' = 'gold'): string {
  switch (tone) {
    case 'green':
      return 'border-win-green/35'
    case 'crimson':
      return 'border-crimson/35'
    case 'muted':
      return 'border-line-strong/40'
    default:
      return 'border-gold/35'
  }
}

function valueTone(tone: 'gold' | 'green' | 'crimson' | 'muted' = 'gold'): string {
  switch (tone) {
    case 'green':
      return 'text-win-green'
    case 'crimson':
      return 'text-crimson'
    case 'muted':
      return 'text-muted'
    default:
      return 'text-gold'
  }
}

function Card({
  label,
  title,
  value,
  detail,
  href,
  tone = 'gold',
}: {
  label: string
  title: string
  value: string
  detail: string
  href?: string
  tone?: 'gold' | 'green' | 'crimson' | 'muted'
}) {
  const body = (
    <div className={`bg-surface-2 border ${cardTone(tone)} rounded-2xl p-5 h-full`}>
      <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
        {label}
      </p>
      <h3 className="text-sm font-semibold text-fg mb-3">{title}</h3>
      <div className={`text-2xl font-bold tnum ${valueTone(tone)}`}>{value}</div>
      <p className="mt-3 text-xs text-muted leading-relaxed">{detail}</p>
    </div>
  )

  if (!href) return body
  return (
    <Link href={href} className="block h-full transition-colors hover:brightness-110">
      {body}
    </Link>
  )
}

function MiniRow({
  label,
  value,
  detail,
  tone = 'gold',
  href,
}: {
  label: string
  value: string
  detail: string
  tone?: 'gold' | 'green' | 'crimson' | 'muted'
  href?: string
}) {
  const content = (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <div className="text-sm text-fg font-medium">{label}</div>
        <div className="text-2xs text-muted-2 mt-0.5">{detail}</div>
      </div>
      <div className={`text-sm font-bold tnum ${valueTone(tone)}`}>{value}</div>
    </div>
  )

  if (!href) return <div className="rounded-lg bg-surface px-3 py-2">{content}</div>
  return (
    <Link href={href} className="block rounded-lg bg-surface px-3 py-2 hover:bg-surface-3">
      {content}
    </Link>
  )
}

function confidence(played: number): string {
  if (played >= 5) return 'strong sample'
  if (played >= 2) return 'medium sample'
  return 'low sample'
}

function opponentLabel(name: string): string {
  return cleanOpponentName(name) ?? name
}

function topBy<T>(
  rows: T[],
  pick: (row: T) => number | null,
  dir: 'asc' | 'desc' = 'desc'
): T | null {
  let best: T | null = null
  let bestValue: number | null = null
  for (const row of rows) {
    const value = pick(row)
    if (value == null) continue
    if (best == null || bestValue == null) {
      best = row
      bestValue = value
      continue
    }
    if (dir === 'desc' ? value > bestValue : value < bestValue) {
      best = row
      bestValue = value
    }
  }
  return best
}

export default function CoachTab({
  summary,
  mapPool,
  players,
  opps,
  roundsStats,
  gems,
}: {
  summary: CoachSummary
  mapPool: MapPoolEntry[]
  players: PlayerStat[]
  opps: OppStat[]
  roundsStats: RoundStats
  gems: GemsBundle
}) {
  const pickMaps = mapPool.filter((m) => m.recommendation === 'Pick').slice(0, 3)
  const developMaps = mapPool.filter((m) => m.recommendation === 'Develop').slice(0, 3)
  const banMaps = mapPool.filter((m) => m.recommendation === 'Ban').slice(0, 3)
  const bestPick = pickMaps[0] ?? null
  const prepOpp = summary.mostLoggedOpp
    ? opps.find((o) => o.name === summary.mostLoggedOpp?.name) ?? null
    : null
  const playerToReview =
    players.find((p) => p.name === summary.bottomPlayer?.name) ??
    topBy(players, (p) => p.drag, 'desc')
  const tradePct = gems.tradePct.ourTradedPct
  const pistolDelta = pointDelta(
    gems.pistolCarryOver.afterWin.winPct,
    gems.pistolCarryOver.afterLoss.winPct
  )
  const weakestRound = summary.worstRoundType
    ? roundsStats.matrix[summary.worstRoundType as keyof typeof roundsStats.matrix]
    : null
  const roundDetail = weakestRound
    ? `ATT ${pctCell(weakestRound.att)} | DEF ${pctCell(weakestRound.def)}`
    : 'Open rounds for the full matrix.'

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card
          label="Practice first"
          title={summary.worstMap ? `${summary.worstMap.map} needs reps` : 'Find the weakest map'}
          value={summary.worstMap ? `${summary.worstMap.winPct}%` : '-'}
          detail={
            summary.worstMap
              ? `${summary.worstMap.games} games. Pair this with ${summary.worstSide ?? 'side'} and ${summary.worstRoundType ?? 'round'} review.`
              : 'Need at least 2 matches on a map before this call is reliable.'
          }
          href="/app/analytics?tab=maps"
          tone="crimson"
        />
        <Card
          label="Map call"
          title={bestPick ? `${bestPick.map} is the pick lane` : 'No locked pick yet'}
          value={bestPick?.winPct == null ? '-' : `${bestPick.winPct}%`}
          detail={
            bestPick
              ? `${bestPick.wins}-${bestPick.losses} over ${bestPick.played} games - ${confidence(bestPick.played)}.`
              : 'Keep building sample before treating any map as a permanent pick.'
          }
          href="/app/analytics?tab=maps"
          tone="green"
        />
        <Card
          label="Player review"
          title={playerToReview ? playerToReview.name : 'No review target'}
          value={
            playerToReview?.drag != null
              ? `Team drops ${playerToReview.drag} pts`
              : playerToReview?.avgAcs != null
              ? `${playerToReview.avgAcs} ACS`
              : '-'
          }
          detail={
            playerToReview
              ? 'When this player dies, rounds get harder to close. Review positioning, trades, and support.'
              : 'Import player rows to unlock player review.'
          }
          href="/app/analytics?tab=players"
          tone={playerToReview ? 'crimson' : 'muted'}
        />
        <Card
          label="Prep target"
          title={
            prepOpp
              ? `Prep vs ${opponentLabel(prepOpp.name)}`
              : summary.mostLoggedOpp
              ? `Prep vs ${opponentLabel(summary.mostLoggedOpp.name)}`
              : 'Pick an opponent'
          }
          value={summary.mostLoggedOpp ? `${summary.mostLoggedOpp.count} logs` : '-'}
          detail={
            prepOpp
              ? `${prepOpp.wins}-${prepOpp.losses} H2H. Jump to their checklist before scrim.`
              : 'Opponent prep unlocks once matches are logged.'
          }
          href={
            summary.mostLoggedOpp
              ? `/app/prep?opp=${encodeURIComponent(summary.mostLoggedOpp.name)}`
              : '/app/analytics?tab=opps'
          }
          tone="gold"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <div>
              <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                Map pool
              </p>
              <h2 className="text-lg font-semibold text-fg">Pick, ban, develop</h2>
            </div>
            <Link href="/app/analytics?tab=maps" className="text-2xs uppercase tracking-wider text-muted hover:text-gold">
              maps
            </Link>
          </div>
          <div className="space-y-2">
            {pickMaps.length > 0 ? (
              pickMaps.map((m) => (
                <MiniRow
                  key={m.map}
                  label={m.map}
                  value={m.winPct == null ? '-' : `${m.winPct}%`}
                  detail={`Pick | ${m.wins}-${m.losses} | ${confidence(m.played)}`}
                  tone="green"
                  href={`/app/analytics?tab=complab&map=${encodeURIComponent(m.map)}`}
                />
              ))
            ) : (
              <MiniRow label="Pick" value="-" detail="No map has enough evidence yet." tone="muted" />
            )}
            {banMaps.map((m) => (
              <MiniRow
                key={m.map}
                label={m.map}
                value="ban"
                detail={`${m.wins}-${m.losses} | ${confidence(m.played)}`}
                tone="crimson"
              />
            ))}
            {developMaps.slice(0, Math.max(0, 3 - banMaps.length)).map((m) => (
              <MiniRow
                key={m.map}
                label={m.map}
                value="dev"
                detail={`${m.played} games | build sample before calling it`}
                tone="muted"
              />
            ))}
          </div>
        </div>

        <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <div>
              <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                Round fixes
              </p>
              <h2 className="text-lg font-semibold text-fg">Convert the basics</h2>
            </div>
            <Link href="/app/analytics?tab=rounds" className="text-2xs uppercase tracking-wider text-muted hover:text-gold">
              rounds
            </Link>
          </div>
          <div className="space-y-2">
            <MiniRow
              label={summary.worstRoundType ?? 'Round type'}
              value={summary.worstRoundType ? 'review' : '-'}
              detail={roundDetail}
              tone="crimson"
              href="/app/analytics?tab=rounds"
            />
            <MiniRow
              label="First blood swing"
              value={pointDelta(roundsStats.firstBlood.ourFb.winPct, roundsStats.firstBlood.theirFb.winPct)}
              detail={`Our FB ${pctCell(roundsStats.firstBlood.ourFb)} | their FB ${pctCell(roundsStats.firstBlood.theirFb)}`}
              tone="gold"
              href="/app/analytics?tab=rounds"
            />
            <MiniRow
              label="Pistol carry-over"
              value={pistolDelta}
              detail={`After W ${pctCell(gems.pistolCarryOver.afterWin)} | after L ${pctCell(gems.pistolCarryOver.afterLoss)}`}
              tone={pistolDelta.startsWith('-') ? 'crimson' : 'green'}
              href="/app/analytics?tab=advanced"
            />
          </div>
        </div>

        <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <div>
              <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                Team pulse
              </p>
              <h2 className="text-lg font-semibold text-fg">Form and cohesion</h2>
            </div>
            <Link href="/app/trends" className="text-2xs uppercase tracking-wider text-muted hover:text-gold">
              trends
            </Link>
          </div>
          <div className="space-y-2">
            <MiniRow
              label="Last 5"
              value={recordStr(summary.last5)}
              detail={`Last 10 ${recordStr(summary.last10)} | this week ${summary.thisWeek} scrims`}
              tone="green"
              href="/app/trends"
            />
            <MiniRow
              label="Side bias"
              value={summary.sideBias ?? '-'}
              detail={`ATT ${summary.attPct ?? '-'}% | DEF ${summary.defPct ?? '-'}%`}
              tone={summary.sideBias === 'Balanced' ? 'green' : 'gold'}
              href="/app/analytics?tab=rounds"
            />
            <MiniRow
              label="Trade rate"
              value={tradePct == null ? '-' : `${tradePct}%`}
              detail={`${gems.tradePct.tradedN} tracked traded-death rounds`}
              tone={tradePct != null && tradePct >= 60 ? 'green' : tradePct != null && tradePct < 35 ? 'crimson' : 'gold'}
              href="/app/analytics?tab=advanced"
            />
          </div>
        </div>
      </section>
    </div>
  )
}
