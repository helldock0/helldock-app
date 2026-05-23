import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  computePulse,
  computeBroken,
  computeWorking,
  computeOppIntel,
  computeEntry,
  computeWatchList,
  type DashMatch,
  type DashRound,
  type DashMatchPlayer,
  type WatchItem,
} from '@/lib/dashboard'
import { computeWeeklyRetro, type TrendsMatchPlayer } from '@/lib/trends'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  computeCrossMatchReviewQueue,
  type ReviewQueueRound,
  type DashboardReviewItem,
} from '@/lib/review-queue'
import {
  trainWinProbability,
  type WPRound,
} from '@/lib/win-probability'

export const dynamic = 'force-dynamic'

// ── Primitives ─────────────────────────────────────────────────────────────

type CardProps = {
  label: string
  value: string | number
  sub?: string | null
  href?: string
  accent?: 'crimson' | 'gold' | null
  size?: 'sm' | 'md'
}

function Card({ label, value, sub, href, accent = null, size = 'md' }: CardProps) {
  const accentBorder =
    accent === 'crimson'
      ? 'before:bg-crimson/70'
      : accent === 'gold'
      ? 'before:bg-gold/70'
      : 'before:bg-transparent'

  const valueClass =
    size === 'sm'
      ? 'text-2xl font-semibold tnum'
      : 'text-[2.25rem] leading-none font-bold tnum'

  const valueColor = accent === 'crimson' ? 'text-fg' : 'text-gold'

  const body = (
    <div
      className={`
        group relative overflow-hidden rounded-2xl bg-surface-2 p-5 h-full
        border border-line-strong/40
        before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${accentBorder}
        transition-all duration-200 ease-out
        hover:bg-surface-3 hover:border-line-strong
        ${href ? 'cursor-pointer' : ''}
      `}
    >
      <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-3">
        {label}
      </div>
      <div className={`${valueClass} ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-2 truncate">{sub}</div>}
    </div>
  )
  return href ? (
    <Link href={href} className="block focus:outline-none">
      {body}
    </Link>
  ) : (
    body
  )
}

function ZoneHeader({
  title,
  accent = 'gold',
  hint,
}: {
  title: string
  accent?: 'gold' | 'crimson' | 'muted'
  hint?: string
}) {
  const dot =
    accent === 'gold' ? 'bg-gold' : accent === 'crimson' ? 'bg-crimson' : 'bg-muted-2'
  return (
    <div className="flex items-baseline justify-between mb-3 mt-1">
      <h2 className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.22em] text-fg/90">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        {title}
      </h2>
      {hint && <span className="text-2xs text-muted-2 uppercase tracking-wider">{hint}</span>}
    </div>
  )
}

function dash(n: number | null | undefined, suffix = ''): string {
  if (n === null || n === undefined) return '—'
  return `${n}${suffix}`
}

function ReviewQueueRow({ item }: { item: DashboardReviewItem }) {
  const sideShort =
    item.side === 'Attack' ? 'ATT' : item.side === 'Defense' ? 'DEF' : '—'
  const outcomeColor =
    item.outcome === 'W' ? 'text-win-green' : 'text-crimson'
  const topReason = item.reasons[0]?.text ?? '—'
  const scorePct = Math.round(item.score * 100)
  const href = `/app/matches/${encodeURIComponent(item.matchIdHelldock)}?tab=Rounds&round=${item.roundNum}`

  return (
    <Link href={href} className="block focus:outline-none group">
      <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-surface-3 transition-colors">
        {/* Score badge */}
        <div className="shrink-0 w-12 text-center">
          <div className="text-lg font-bold font-mono text-gold tnum leading-tight">
            {scorePct}
          </div>
          <div className="text-2xs uppercase tracking-wider text-muted-2">score</div>
        </div>
        {/* Match + round identifier */}
        <div className="shrink-0 w-40">
          <div className="text-sm font-mono text-fg tabular-nums">
            {item.matchIdHelldock} · R{item.roundNum}
          </div>
          <div className="text-xs text-muted truncate">
            {item.mapName ?? '—'} {item.opponentName ? `· ${item.opponentName}` : ''}
          </div>
        </div>
        {/* Side + outcome chips */}
        <div className="shrink-0 flex items-center gap-2 w-24">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-2">{sideShort}</span>
          <span className={`text-sm font-bold ${outcomeColor}`}>
            {item.outcome}
          </span>
          {item.coachGrade == null && (
            <span className="text-2xs text-gold opacity-80 uppercase tracking-wider">ungr</span>
          )}
        </div>
        {/* Top reason */}
        <div className="flex-1 min-w-0 text-sm text-muted truncate">
          {topReason}
        </div>
        <span className="shrink-0 text-xs text-muted-2 group-hover:text-gold transition-colors">
          ▶
        </span>
      </div>
    </Link>
  )
}

function WatchCard({ item }: { item: WatchItem }) {
  const isAlert = item.severity === 'alert'
  const accent = isAlert ? 'before:bg-crimson/80' : 'before:bg-gold/70'
  const pill = isAlert
    ? 'bg-crimson/15 text-crimson border-crimson/40'
    : 'bg-gold/15 text-gold border-gold/40'
  const body = (
    <div
      className={`
        group relative overflow-hidden rounded-2xl bg-surface-2 p-4
        border border-line-strong/40
        before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${accent}
        transition-all duration-200 ease-out
        hover:bg-surface-3 hover:border-line-strong
        ${item.href ? 'cursor-pointer' : ''}
      `}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3 className="text-sm font-semibold text-fg leading-tight tnum">{item.title}</h3>
        <span
          className={`shrink-0 text-2xs uppercase tracking-wider border px-2 py-0.5 rounded ${pill}`}
        >
          {isAlert ? 'act' : 'check'}
        </span>
      </div>
      <p className="text-xs text-muted leading-snug">{item.detail}</p>
    </div>
  )
  return item.href ? (
    <Link href={item.href} className="block focus:outline-none">
      {body}
    </Link>
  ) : (
    body
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents'
    )
    .is('deleted_at', null)
    .eq('team_id', teamId)

  const matches: DashMatch[] = matchesRaw ?? []
  const matchIds = matches.map((m) => m.id)

  const [roundsRes, mpRes] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from('rounds')
          .select(
            'match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site, our_econ, their_econ, coach_grade, coach_tags'
          )
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase
          .from('match_players')
          .select(
            'match_id, player_id, acs, rounds_afk, friendly_fire_outgoing, player:players(display_name, roster_status)'
          )
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
  ])

  const rounds: DashRound[] = roundsRes.data ?? []
  // Trials don't count toward team aggregates. Orphans (no player linked) and
  // main/sub players are kept.
  const matchPlayers = ((mpRes.data ?? []) as unknown as Array<
    DashMatchPlayer & { player?: { roster_status?: string } | null }
  >).filter((p) => p.player?.roster_status !== 'trial') as DashMatchPlayer[]

  if (matches.length === 0) {
    return (
      <main className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">scrim ops</p>
          <h1 className="text-3xl font-bold text-gold tracking-tight mb-3">No data yet</h1>
          <p className="text-muted text-sm mb-8">
            Import matches from HenrikDev or log one manually to see the pulse.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/app/import"
              className="bg-gold text-black font-semibold px-5 py-2 rounded-lg hover:bg-gold-hover transition-colors text-sm"
            >
              Import matches
            </Link>
            <Link
              href="/app/matches/new"
              className="border border-line-strong text-fg font-semibold px-5 py-2 rounded-lg hover:border-gold transition-colors text-sm"
            >
              + New Match
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Ingest failures badge — surface silent errors from kill_events/Discord paths.
  const { count: failureCount } = await supabase
    .from('ingest_failures')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)

  const pulse = computePulse(matches)
  const broken = computeBroken(matches, rounds)
  const working = computeWorking(matches, rounds, matchPlayers)
  const oppIntel = computeOppIntel(matches)
  const entry = computeEntry(rounds)
  const watchList = computeWatchList(matches, rounds, matchPlayers)

  // Review queue across the last 3 matches. Trains a one-shot WP model from
  // all historical rounds (same flow as `/app/matches/[id]`) and ranks rounds
  // worth a second look. Capped at 5 globally so the card stays scannable.
  const wpHistorical: WPRound[] = rounds.map((r) => ({
    match_id: r.match_id,
    round_num: r.round_num,
    side: r.side,
    outcome: r.outcome,
    round_type: r.round_type,
    our_econ: r.our_econ ?? null,
    their_econ: r.their_econ ?? null,
  }))
  const wpModel = trainWinProbability(wpHistorical)

  const matchesByDate = matches.slice().sort((a, b) =>
    b.match_date.localeCompare(a.match_date)
  )
  const last3Matches = matchesByDate.slice(0, 3)
  const last3MatchIds = new Set(last3Matches.map((m) => m.id))
  const roundsByMatch = new Map<string, ReviewQueueRound[]>()
  for (const r of rounds) {
    if (!last3MatchIds.has(r.match_id)) continue
    const bucket = roundsByMatch.get(r.match_id) ?? []
    bucket.push({
      round_num: r.round_num,
      side: r.side,
      outcome: r.outcome,
      round_type: r.round_type,
      our_econ: r.our_econ ?? null,
      their_econ: r.their_econ ?? null,
      first_blood: r.first_blood,
      clutch_type: r.clutch_type,
      clutch_player: r.clutch_player,
      coach_grade: r.coach_grade ?? null,
      coach_tags: r.coach_tags ?? null,
    })
    roundsByMatch.set(r.match_id, bucket)
  }
  const reviewQueue: DashboardReviewItem[] = computeCrossMatchReviewQueue({
    matches: last3Matches.map((m) => ({
      match_id_helldock: m.match_id_helldock,
      match_date: m.match_date,
      opponent_name: m.opponent_name,
      map_name: m.map_name,
      result: m.result,
      rounds: roundsByMatch.get(m.id) ?? [],
    })),
    wpWeights: wpModel?.weights ?? null,
    topN: 5,
    perMatchCap: 3,
  })

  // Weekly retro for the trend-alert strip (only renders when |Δwr| ≥ 3pp).
  // Trends compute needs player_id present — orphans get filtered out.
  const trendsMatchPlayers: TrendsMatchPlayer[] = matchPlayers
    .filter((mp): mp is DashMatchPlayer & { player_id: string } => mp.player_id != null)
    .map((mp) => ({ match_id: mp.match_id, player_id: mp.player_id, acs: mp.acs, player: mp.player }))
  const weeklyRetro = computeWeeklyRetro(matches, rounds, trendsMatchPlayers)
  const trendAlert =
    weeklyRetro.delta.winPct !== null && Math.abs(weeklyRetro.delta.winPct) >= 3
      ? {
          deltaPp: weeklyRetro.delta.winPct,
          curr: weeklyRetro.current.winPct,
          prior: weeklyRetro.prior.winPct,
          currN: weeklyRetro.current.matches,
        }
      : null

  return (
    <main className="px-6 py-6 max-w-7xl mx-auto">
      {/* Page heading */}
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
            command center
          </p>
          <h1 className="text-2xl font-bold text-fg leading-tight mt-1">Pulse</h1>
        </div>
        <div className="flex items-center gap-3">
          {failureCount != null && failureCount > 0 && (
            <Link
              href="/api/admin/failures"
              className="
                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md
                bg-crimson/15 border border-crimson/40 text-crimson
                text-2xs font-bold uppercase tracking-[0.16em]
                hover:bg-crimson/25 transition-colors
              "
              title="Unresolved ingest failures (Discord / kill_events)"
            >
              ⚠ {failureCount} failure{failureCount === 1 ? '' : 's'}
            </Link>
          )}
          <p className="text-2xs text-muted-2 uppercase tracking-wider tnum">
            {pulse.totalScrims} scrims · live
          </p>
        </div>
      </div>

      {/* Zone 1 — PULSE */}
      <section className="mb-7">
        <ZoneHeader title="Pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card label="Total Scrims" value={pulse.totalScrims} href="/app/matches" />
          <Card label="This Week" value={pulse.thisWeek} href="/app/matches" />
          <Card
            label="Win Rate"
            value={pulse.winRate === null ? '—' : `${pulse.winRate}%`}
            href="/app/matches"
          />
          <Card label="Win Streak" value={pulse.winStreak} href="/app/matches" />
          <Card
            label="Last Match"
            value={pulse.lastMap ? pulse.lastMap.text : '—'}
            sub={pulse.lastMap?.mapName ?? null}
            href={pulse.lastMap ? `/app/matches/${pulse.lastMap.matchId}` : '/app/matches'}
            size="sm"
          />
          <Card
            label="Most Played"
            value={pulse.mostPlayedMap ? pulse.mostPlayedMap.map : '—'}
            sub={pulse.mostPlayedMap ? `${pulse.mostPlayedMap.count} games` : null}
            href="/app/analytics?tab=maps"
            size="sm"
          />
        </div>
      </section>

      {/* Zone 1.5 — WATCH LIST */}
      {watchList.length > 0 && (
        <section className="mb-7">
          <ZoneHeader
            title="Watch list"
            accent={watchList.some((w) => w.severity === 'alert') ? 'crimson' : 'gold'}
            hint={`${watchList.length} anomaly${watchList.length === 1 ? '' : 'ies'}`}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {watchList.map((item) => (
              <WatchCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Zone 1.6 — REVIEW QUEUE (last 3 matches) */}
      {reviewQueue.length > 0 && (
        <section className="mb-7">
          <ZoneHeader
            title="Review queue"
            accent="gold"
            hint={`top ${reviewQueue.length} across last ${last3Matches.length} match${last3Matches.length === 1 ? '' : 'es'}`}
          />
          <div className="bg-surface-2 rounded-2xl border border-line-strong/40 divide-y divide-line">
            {reviewQueue.map((item) => (
              <ReviewQueueRow key={`${item.matchIdHelldock}-${item.roundNum}`} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* Zone 2 — WHAT'S BROKEN */}
      <section className="mb-7">
        <ZoneHeader title="What's broken" accent="crimson" hint="fix these" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card
            label="Worst Map"
            value={broken.worstMap ? broken.worstMap.map : '—'}
            sub={
              broken.worstMap
                ? `${broken.worstMap.pct}% · ${broken.worstMap.wins}-${broken.worstMap.total - broken.worstMap.wins}`
                : 'need 2+ games per map'
            }
            accent="crimson"
            href="/app/analytics?tab=maps"
            size="sm"
          />
          <Card
            label="DEF Side"
            value={broken.defPct === null ? '—' : `${broken.defPct}%`}
            sub={broken.defSample > 0 ? `${broken.defSample} rounds tracked` : 'no round data'}
            accent="crimson"
            href="/app/analytics?tab=rounds"
          />
          <Card
            label="Pistol DEF L Streak"
            value={broken.pistolDefLStreak}
            sub="consecutive losses"
            accent="crimson"
            href="/app/analytics?tab=rounds"
          />
          <Card
            label="1v1 Losses"
            value={broken.oneVOneLosses}
            sub="rounds lost in 1v1"
            accent="crimson"
            href="/app/matches"
          />
        </div>
      </section>

      {/* Zone 3 — WHAT'S WORKING */}
      <section className="mb-7">
        <ZoneHeader title="What's working" accent="gold" hint="ride these" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Card
            label="Best Map"
            value={working.bestMap ? working.bestMap.map : '—'}
            sub={
              working.bestMap
                ? `${working.bestMap.pct}% · ${working.bestMap.wins}-${working.bestMap.total - working.bestMap.wins}`
                : 'need 2+ games per map'
            }
            accent="gold"
            href="/app/analytics?tab=maps"
            size="sm"
          />
          <Card
            label="ATT Side"
            value={working.attPct === null ? '—' : `${working.attPct}%`}
            sub={working.attSample > 0 ? `${working.attSample} rounds tracked` : 'no round data'}
            accent="gold"
            href="/app/analytics?tab=rounds"
          />
          <Card
            label="Best Player (7d)"
            value={working.bestPlayer ? working.bestPlayer.name : '—'}
            sub={
              working.bestPlayer
                ? `${working.bestPlayer.avgAcs} ACS · ${working.bestPlayer.n} games`
                : 'no recent stats'
            }
            accent="gold"
            href="/app/analytics?tab=players"
            size="sm"
          />
          <Card
            label="Comp Working"
            value={working.bestComp ? `${working.bestComp.wins}W` : '—'}
            sub={working.bestComp ? working.bestComp.agents.join(' · ') : 'no comp data'}
            accent="gold"
            href="/app/analytics?tab=complab"
            size="sm"
          />
        </div>
      </section>

      {/* Trend alert — only renders on a 3pp+ WoW swing */}
      {trendAlert && (
        <section className="mb-7">
          <Link
            href="/app/trends"
            className={`
              group block rounded-2xl border bg-surface-2 p-4
              transition-colors hover:bg-surface-3
              ${trendAlert.deltaPp >= 0 ? 'border-gold/40 hover:border-gold/60' : 'border-crimson/40 hover:border-crimson/60'}
            `}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                  Trend alert · last 7 days
                </div>
                <div className="text-fg text-sm font-medium mt-1 tnum">
                  Win rate{' '}
                  <span className={trendAlert.deltaPp >= 0 ? 'text-gold' : 'text-crimson'}>
                    {trendAlert.deltaPp >= 0 ? '+' : ''}
                    {trendAlert.deltaPp}pp
                  </span>{' '}
                  WoW · {trendAlert.prior === null ? '—' : `${trendAlert.prior}%`}{' '}
                  → {trendAlert.curr === null ? '—' : `${trendAlert.curr}%`}{' '}
                  <span className="text-muted-2">({trendAlert.currN} matches this week)</span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-2 group-hover:text-gold transition-colors">
                see trends →
              </span>
            </div>
          </Link>
        </section>
      )}

      {/* Zone 4 — OPP INTEL */}
      <section className="mb-7">
        <div className="flex items-baseline justify-between mb-3 mt-1">
          <ZoneHeader title="Opp intel" hint="top 5" />
          <Link
            href="/app/prep"
            className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
          >
            🧾 prep →
          </Link>
        </div>
        <div className="bg-surface-2 rounded-2xl border border-line-strong/40 overflow-hidden">
          {oppIntel.length === 0 ? (
            <div className="p-6 text-muted text-sm">no opponents tracked yet</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
                    <th className="text-left px-5 py-3">Opponent</th>
                    <th className="text-center px-4 py-3">Played</th>
                    <th className="text-center px-4 py-3">W</th>
                    <th className="text-center px-4 py-3">L</th>
                    <th className="text-right px-5 py-3">Record</th>
                  </tr>
                </thead>
                <tbody>
                  {oppIntel.map((o, i) => (
                    <tr
                      key={o.name}
                      className={`
                        transition-colors hover:bg-surface-3
                        ${i !== oppIntel.length - 1 ? 'border-b border-line' : ''}
                      `}
                    >
                      <td className="px-5 py-3 text-fg font-medium">{o.name}</td>
                      <td className="px-4 py-3 text-center text-muted tnum">{o.total}</td>
                      <td className="px-4 py-3 text-center text-win-green tnum font-medium">
                        {o.wins}
                      </td>
                      <td className="px-4 py-3 text-center text-crimson tnum font-medium">
                        {o.losses}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-gold tnum">
                        {o.wins}-{o.losses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-line px-5 py-2.5 text-right">
                <Link
                  href="/app/analytics?tab=opps"
                  className="text-xs text-muted-2 hover:text-gold transition-colors"
                >
                  view all opponents →
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Zone 5 — ENTRY STATS */}
      <section className="mb-4">
        <ZoneHeader title="Entry stats" hint="opening duel" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card
            label="FK Conversion"
            value={dash(entry.fkConv, '%')}
            sub={`${entry.fkSample} first-blood rounds`}
            href="/app/analytics?tab=rounds"
          />
          <Card
            label="FD Survival"
            value={dash(entry.fdSurv, '%')}
            sub={`${entry.fdSample} first-death rounds`}
            href="/app/analytics?tab=rounds"
          />
        </div>
      </section>
    </main>
  )
}
