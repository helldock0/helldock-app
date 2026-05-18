import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  computePulse,
  computeBroken,
  computeWorking,
  computeOppIntel,
  computeEntry,
  type DashMatch,
  type DashRound,
  type DashMatchPlayer,
} from '@/lib/dashboard'
import { requireSelectedTeam } from '@/lib/team-session'

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
          .select('match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site')
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase
          .from('match_players')
          .select('match_id, player_id, acs, player:players(display_name)')
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
  ])

  const rounds: DashRound[] = roundsRes.data ?? []
  const matchPlayers = (mpRes.data ?? []) as unknown as DashMatchPlayer[]

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
              href="/import"
              className="bg-gold text-black font-semibold px-5 py-2 rounded-lg hover:bg-gold-hover transition-colors text-sm"
            >
              Import matches
            </Link>
            <Link
              href="/matches/new"
              className="border border-line-strong text-fg font-semibold px-5 py-2 rounded-lg hover:border-gold transition-colors text-sm"
            >
              + New Match
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const pulse = computePulse(matches)
  const broken = computeBroken(matches, rounds)
  const working = computeWorking(matches, rounds, matchPlayers)
  const oppIntel = computeOppIntel(matches)
  const entry = computeEntry(rounds)

  return (
    <main className="px-6 py-6 max-w-7xl mx-auto">
      {/* Page heading */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
            command center
          </p>
          <h1 className="text-2xl font-bold text-fg leading-tight mt-1">Pulse</h1>
        </div>
        <p className="text-2xs text-muted-2 uppercase tracking-wider tnum">
          {pulse.totalScrims} scrims · live
        </p>
      </div>

      {/* Zone 1 — PULSE */}
      <section className="mb-7">
        <ZoneHeader title="Pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card label="Total Scrims" value={pulse.totalScrims} href="/matches" />
          <Card label="This Week" value={pulse.thisWeek} href="/matches" />
          <Card
            label="Win Rate"
            value={pulse.winRate === null ? '—' : `${pulse.winRate}%`}
            href="/matches"
          />
          <Card label="Win Streak" value={pulse.winStreak} href="/matches" />
          <Card
            label="Last Match"
            value={pulse.lastMap ? pulse.lastMap.text : '—'}
            sub={pulse.lastMap?.mapName ?? null}
            href={pulse.lastMap ? `/matches/${pulse.lastMap.matchId}` : '/matches'}
            size="sm"
          />
          <Card
            label="Most Played"
            value={pulse.mostPlayedMap ? pulse.mostPlayedMap.map : '—'}
            sub={pulse.mostPlayedMap ? `${pulse.mostPlayedMap.count} games` : null}
            href="/analytics?tab=maps"
            size="sm"
          />
        </div>
      </section>

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
            href="/analytics?tab=maps"
            size="sm"
          />
          <Card
            label="DEF Side"
            value={broken.defPct === null ? '—' : `${broken.defPct}%`}
            sub={broken.defSample > 0 ? `${broken.defSample} rounds tracked` : 'no round data'}
            accent="crimson"
            href="/analytics?tab=rounds"
          />
          <Card
            label="Pistol DEF L Streak"
            value={broken.pistolDefLStreak}
            sub="consecutive losses"
            accent="crimson"
            href="/analytics?tab=rounds"
          />
          <Card
            label="1v1 Losses"
            value={broken.oneVOneLosses}
            sub="rounds lost in 1v1"
            accent="crimson"
            href="/matches"
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
            href="/analytics?tab=maps"
            size="sm"
          />
          <Card
            label="ATT Side"
            value={working.attPct === null ? '—' : `${working.attPct}%`}
            sub={working.attSample > 0 ? `${working.attSample} rounds tracked` : 'no round data'}
            accent="gold"
            href="/analytics?tab=rounds"
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
            href="/analytics?tab=players"
            size="sm"
          />
          <Card
            label="Comp Working"
            value={working.bestComp ? `${working.bestComp.wins}W` : '—'}
            sub={working.bestComp ? working.bestComp.agents.join(' · ') : 'no comp data'}
            accent="gold"
            href="/analytics?tab=complab"
            size="sm"
          />
        </div>
      </section>

      {/* Zone 4 — OPP INTEL */}
      <section className="mb-7">
        <div className="flex items-baseline justify-between mb-3 mt-1">
          <ZoneHeader title="Opp intel" hint="top 5" />
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
                  href="/analytics?tab=opps"
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
            href="/analytics?tab=rounds"
          />
          <Card
            label="FD Survival"
            value={dash(entry.fdSurv, '%')}
            sub={`${entry.fdSample} first-death rounds`}
            href="/analytics?tab=rounds"
          />
        </div>
      </section>
    </main>
  )
}
