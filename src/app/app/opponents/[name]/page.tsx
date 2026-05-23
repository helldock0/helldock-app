import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  computeOpponentDossier,
  type DossierMatch,
  type DossierOppPlayer,
  type DossierMatchPlayer,
} from '@/lib/opponent-dossier'
import type { DashRound } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function daysSince(d: string | null | undefined) {
  if (!d) return null
  const then = new Date(d + 'T00:00:00').getTime()
  const now = Date.now()
  return Math.round((now - then) / (24 * 60 * 60 * 1000))
}

export default async function OpponentDossierPage({
  params,
}: {
  params: { name: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const opponentName = decodeURIComponent(params.name)

  const supabase = createClient()

  // Fetch matches for this team where opponent matches (case-insensitive).
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents, opp_agents, pick, start_side'
    )
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .ilike('opponent_name', opponentName)

  const matches: DossierMatch[] = matchesRaw ?? []
  if (matches.length === 0) notFound()
  const matchIds = matches.map((m) => m.id)

  const [roundsRes, mpRes, opRes] = await Promise.all([
    supabase
      .from('rounds')
      .select(
        'match_id, round_num, half, side, round_type, outcome, first_blood, clutch_type, clutch_player, site, plant_time_in_round, defuse_time_in_round, our_ults_used, their_ults_used'
      )
      .in('match_id', matchIds),
    supabase
      .from('match_players')
      .select('match_id, player_id, agent, acs, player:players(display_name)')
      .in('match_id', matchIds),
    supabase
      .from('opp_players')
      .select('match_id, agent, riot_id_full, opp_player_name, acs, k, d')
      .in('match_id', matchIds),
  ])

  const rounds: DashRound[] = roundsRes.data ?? []
  const mpRaw = (mpRes.data ?? []) as unknown as {
    match_id: string
    player_id: string
    agent: string | null
    acs: number | null
    player: { display_name: string } | null
  }[]
  const matchPlayers: DossierMatchPlayer[] = mpRaw.map((mp) => ({
    match_id: mp.match_id,
    player_id: mp.player_id,
    agent: mp.agent,
    acs: mp.acs,
    display_name: mp.player?.display_name ?? null,
  }))
  const oppPlayers = (opRes.data ?? []) as DossierOppPlayer[]

  const dossier = computeOpponentDossier(
    opponentName,
    matches,
    rounds,
    matchPlayers,
    oppPlayers
  )
  if (!dossier) notFound()

  const days = daysSince(dossier.lastMet)

  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-1">
          <Link
            href="/app/analytics?tab=opps"
            className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
          >
            ← all opponents
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
              dossier
            </p>
            <h1 className="text-3xl font-bold text-fg leading-tight">
              {dossier.name}
            </h1>
          </div>
          <Link
            href={`/app/prep?opp=${encodeURIComponent(dossier.name)}`}
            className="px-4 py-2 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover transition-colors"
          >
            🧾 Prep checklist →
          </Link>
        </div>
      </div>

      {/* H2H summary */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <Stat label="Played" value={dossier.played.toString()} />
          <Stat
            label="Record"
            value={`${dossier.wins}–${dossier.losses}`}
            color={dossier.wins > dossier.losses ? 'win-green' : dossier.losses > dossier.wins ? 'crimson' : 'fg'}
          />
          <Stat
            label="Win %"
            value={dossier.winPct == null ? '—' : `${dossier.winPct}%`}
            color="gold"
          />
          <Stat
            label="Last met"
            value={days == null ? '—' : `${days}d ago`}
            sub={formatDate(dossier.lastMet)}
          />
          <Stat
            label="Pick split"
            value={`${dossier.pickSplit.ourPick}/${dossier.pickSplit.theirPick}/${dossier.pickSplit.decider}`}
            sub="ours/theirs/decider"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Their map pool */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Their map pool" />
          {dossier.maps.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {dossier.maps.map((m) => (
                <div
                  key={m.map}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm py-1.5 px-2 rounded hover:bg-surface-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-fg font-medium truncate">{m.map}</span>
                    <span className="text-2xs text-muted-2 tnum shrink-0">
                      n={m.total}
                    </span>
                  </div>
                  <span className="text-xs font-mono tnum text-muted">
                    <span className="text-crimson">{m.oppWins}</span>–
                    <span className="text-win-green">{m.oppLosses}</span>
                    <span className="text-muted-2 ml-1">(their PoV)</span>
                  </span>
                  <span
                    className={`text-sm font-bold tnum w-12 text-right ${
                      m.oppWinPct == null
                        ? 'text-muted-2'
                        : m.oppWinPct >= 60
                        ? 'text-crimson'
                        : m.oppWinPct >= 40
                        ? 'text-gold'
                        : 'text-win-green'
                    }`}
                  >
                    {m.oppWinPct == null ? '—' : `${m.oppWinPct}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Their roster */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Their roster" />
          {dossier.theirRoster.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {dossier.theirRoster.slice(0, 7).map((p) => (
                <div
                  key={p.riotIdFull ?? p.displayName ?? ''}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-surface-3 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-fg font-medium truncate">
                      {p.displayName ?? p.riotIdFull ?? '—'}
                    </div>
                    {p.agents.length > 0 && (
                      <div className="text-2xs text-muted-2 truncate">
                        {p.agents
                          .slice(0, 3)
                          .map((a) => `${a.agent}×${a.count}`)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-gold font-bold tnum">
                      {p.avgAcs ?? '—'}
                    </div>
                    <div className="text-2xs uppercase tracking-wider text-muted-2 tnum">
                      n={p.matches}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Their top comps */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Their top comps" />
          {dossier.theirTopComps.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {dossier.theirTopComps.map((c) => (
                <div
                  key={c.agents.join(',')}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-surface-3 gap-3"
                >
                  <span className="text-2xs uppercase tracking-wider text-muted-2 shrink-0 w-24 truncate">
                    {c.archetype}
                  </span>
                  <span className="text-fg/90 truncate flex-1 mx-1 text-xs">
                    {c.agents.join(' · ')}
                  </span>
                  <span className="font-mono text-muted tnum shrink-0 text-xs">
                    <span className="text-crimson">{c.oppWins}</span>-
                    <span className="text-win-green">{c.played - c.oppWins}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Their tendencies */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Their tendencies" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Tendency
              label="Pistol W%"
              value={
                dossier.tendencies.pistolOppWPct == null
                  ? '—'
                  : `${dossier.tendencies.pistolOppWPct}%`
              }
              sub={`n=${dossier.tendencies.pistolN} pistols`}
              tone={
                dossier.tendencies.pistolOppWPct != null &&
                dossier.tendencies.pistolOppWPct >= 60
                  ? 'crimson'
                  : 'fg'
              }
            />
            <Tendency
              label="Plant rate (ATT)"
              value={
                dossier.tendencies.plantRate == null
                  ? '—'
                  : `${dossier.tendencies.plantRate}%`
              }
              sub={`n=${dossier.tendencies.plantN} of their ATT rounds`}
            />
            <Tendency
              label="Avg ults / round"
              value={
                dossier.tendencies.avgTheirUlts == null
                  ? '—'
                  : dossier.tendencies.avgTheirUlts.toFixed(2)
              }
              sub={`n=${dossier.tendencies.ultN} rounds`}
            />
            <Tendency
              label="Side bias (pick)"
              value={`${dossier.pickSplit.ourPick + dossier.pickSplit.decider}/${dossier.pickSplit.theirPick}`}
              sub="their picks vs ours"
            />
          </div>
        </section>
      </div>

      {/* Tendencies (deep) — S26 */}
      {(dossier.deepTendencies.setupsByRound.length > 0 ||
        dossier.deepTendencies.execTimingByMap.length > 0 ||
        dossier.deepTendencies.siteByHalf.length > 0) && (
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-fg">Tendencies (deep)</h2>
            <p className="text-2xs uppercase tracking-wider text-muted-2 mt-0.5">
              setup defaults · execute timing · site preference by half
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Setups by round phase */}
            {dossier.deepTendencies.setupsByRound.length > 0 && (
              <div>
                <h3 className="text-2xs uppercase tracking-wider text-gold mb-2">
                  Setups by phase
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line">
                      <th className="text-left py-1.5 font-medium">Phase</th>
                      <th className="text-right py-1.5 font-medium">n</th>
                      <th className="text-right py-1.5 font-medium">Win%</th>
                      <th className="text-right py-1.5 font-medium">Plant%</th>
                      <th className="text-right py-1.5 font-medium">Avg sec</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.deepTendencies.setupsByRound.map((s) => (
                      <tr key={s.phase} className="border-b border-line/30">
                        <td className="py-1 text-fg font-medium">{s.phase}</td>
                        <td className="py-1 text-right tabular-nums text-muted">{s.total}</td>
                        <td
                          className={`py-1 text-right tabular-nums ${
                            s.oppWinPct == null
                              ? 'text-muted-2'
                              : s.oppWinPct >= 60
                              ? 'text-crimson'
                              : s.oppWinPct >= 40
                              ? 'text-gold'
                              : 'text-win-green'
                          }`}
                        >
                          {s.oppWinPct == null ? '—' : `${s.oppWinPct}%`}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted">
                          {s.plantRate == null ? '—' : `${s.plantRate}%`}
                        </td>
                        <td className="py-1 text-right tabular-nums text-muted">
                          {s.avgPlantTime == null ? '—' : `${s.avgPlantTime}s`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Execute timing per map */}
            {dossier.deepTendencies.execTimingByMap.length > 0 && (
              <div>
                <h3 className="text-2xs uppercase tracking-wider text-gold mb-2">
                  Execute timing
                </h3>
                <div className="space-y-3">
                  {dossier.deepTendencies.execTimingByMap.map((m) => (
                    <div key={m.map}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-fg font-medium">{m.map}</span>
                        <span className="text-2xs text-muted-2 tnum">
                          n={m.total}
                          {m.modal && (
                            <span className="ml-1.5 text-gold/80">· mostly {m.modal}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex h-2 rounded overflow-hidden bg-surface">
                        {m.buckets.map((b) => (
                          <div
                            key={b.bucket}
                            className={
                              b.bucket === 'Fast (<30s)'
                                ? 'bg-crimson/80'
                                : b.bucket === 'Default (30-60s)'
                                ? 'bg-gold/80'
                                : 'bg-win-green/80'
                            }
                            style={{ width: `${b.pct}%` }}
                            title={`${b.bucket}: ${b.count} (${b.pct}%)`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-2xs text-muted-2 mt-0.5 tnum">
                        <span>{m.buckets[0].pct}% fast</span>
                        <span>{m.buckets[1].pct}% default</span>
                        <span>{m.buckets[2].pct}% slow</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Site preference by half */}
            {dossier.deepTendencies.siteByHalf.length > 0 && (
              <div>
                <h3 className="text-2xs uppercase tracking-wider text-gold mb-2">
                  Site by half
                </h3>
                <div className="space-y-3">
                  {dossier.deepTendencies.siteByHalf.map((m) => (
                    <div key={m.map}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-fg font-medium">{m.map}</span>
                        {m.swing.length > 0 && (
                          <span className="text-2xs text-gold tnum">
                            swings:{' '}
                            {m.swing.map((s) => (
                              <span key={s.site} className="ml-1">
                                {s.site} {s.deltaPp >= 0 ? '+' : ''}
                                {s.deltaPp}pp
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                      <table className="w-full text-2xs">
                        <thead>
                          <tr className="text-muted-2 border-b border-line/40">
                            <th className="text-left py-0.5">half</th>
                            <th className="text-right py-0.5">A</th>
                            <th className="text-right py-0.5">B</th>
                            <th className="text-right py-0.5">C</th>
                            <th className="text-right py-0.5">n</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          <tr className="border-b border-line/20">
                            <td className="py-0.5 text-muted">1st</td>
                            <td className="py-0.5 text-right text-fg">
                              {m.firstHalf.aPct == null ? '—' : `${m.firstHalf.aPct}%`}
                            </td>
                            <td className="py-0.5 text-right text-fg">
                              {m.firstHalf.bPct == null ? '—' : `${m.firstHalf.bPct}%`}
                            </td>
                            <td className="py-0.5 text-right text-fg">
                              {m.firstHalf.cPct == null ? '—' : `${m.firstHalf.cPct}%`}
                            </td>
                            <td className="py-0.5 text-right text-muted-2">{m.firstHalf.total}</td>
                          </tr>
                          <tr>
                            <td className="py-0.5 text-muted">2nd</td>
                            <td className="py-0.5 text-right text-fg">
                              {m.secondHalf.aPct == null ? '—' : `${m.secondHalf.aPct}%`}
                            </td>
                            <td className="py-0.5 text-right text-fg">
                              {m.secondHalf.bPct == null ? '—' : `${m.secondHalf.bPct}%`}
                            </td>
                            <td className="py-0.5 text-right text-fg">
                              {m.secondHalf.cPct == null ? '—' : `${m.secondHalf.cPct}%`}
                            </td>
                            <td className="py-0.5 text-right text-muted-2">{m.secondHalf.total}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* What works for us */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <section className="bg-surface-2 border border-gold/30 rounded-2xl p-5">
          <SectionHeader title="What works for us — comps" accent="gold" />
          {dossier.ourBestComps.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {dossier.ourBestComps.map((c) => (
                <div
                  key={c.agents.join(',')}
                  className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-surface-3 gap-3"
                >
                  <span className="text-2xs uppercase tracking-wider text-muted-2 shrink-0 w-24 truncate">
                    {c.archetype}
                  </span>
                  <span className="text-fg/90 truncate flex-1 mx-1 text-xs">
                    {c.agents.join(' · ')}
                  </span>
                  <span className="font-mono text-muted tnum shrink-0 text-xs w-12 text-right">
                    <span className="text-win-green">{c.ourWins}</span>-
                    <span className="text-crimson">{c.played - c.ourWins}</span>
                  </span>
                  <span
                    className={`tnum font-bold w-12 text-right shrink-0 ${
                      c.ourWinPct == null
                        ? 'text-muted-2'
                        : c.ourWinPct >= 60
                        ? 'text-win-green'
                        : c.ourWinPct >= 40
                        ? 'text-gold'
                        : 'text-crimson'
                    }`}
                  >
                    {c.ourWinPct == null ? '—' : `${c.ourWinPct}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
          {dossier.ourTopFragger && (
            <div className="mt-4 pt-3 border-t border-line text-sm">
              <span className="text-2xs uppercase tracking-wider text-muted-2 mr-2">
                Top fragger vs them:
              </span>
              <span className="text-fg font-medium">
                {dossier.ourTopFragger.name}
              </span>
              <span className="ml-2 text-gold tnum font-bold">
                {dossier.ourTopFragger.avgAcs} ACS
              </span>
            </div>
          )}
        </section>

        <section className="bg-surface-2 border border-gold/30 rounded-2xl p-5">
          <SectionHeader title="Sites we convert on" accent="gold" />
          {dossier.ourSiteConversions.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {dossier.ourSiteConversions.map((s) => (
                <div
                  key={`${s.map}|${s.site}`}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm py-1.5 px-2 rounded hover:bg-surface-3"
                >
                  <div className="text-fg font-medium truncate">
                    {s.map}
                    <span className="ml-2 text-2xs uppercase tracking-wider text-gold/80">
                      site {s.site}
                    </span>
                  </div>
                  <span className="text-xs font-mono tnum text-muted">
                    <span className="text-win-green">{s.ourWins}</span>–
                    <span className="text-crimson">{s.total - s.ourWins}</span>
                  </span>
                  <span
                    className={`tnum font-bold w-12 text-right ${
                      s.ourWinPct == null
                        ? 'text-muted-2'
                        : s.ourWinPct >= 60
                        ? 'text-win-green'
                        : s.ourWinPct >= 40
                        ? 'text-gold'
                        : 'text-crimson'
                    }`}
                  >
                    {s.ourWinPct == null ? '—' : `${s.ourWinPct}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* History */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
        <SectionHeader title="Match history" />
        <div className="space-y-1">
          {dossier.history.map((h) => (
            <Link
              key={h.matchIdHelldock}
              href={`/app/matches/${h.matchIdHelldock}`}
              className="flex items-center justify-between gap-3 text-xs px-3 py-1.5 rounded-md bg-surface hover:bg-surface-3 transition-colors"
            >
              <span className="font-mono text-gold tnum w-14">
                {h.matchIdHelldock}
              </span>
              <span className="text-muted tnum w-24">{formatDate(h.date)}</span>
              <span className="text-fg flex-1 truncate">{h.map ?? '—'}</span>
              <span className="font-mono tnum text-fg w-16 text-right">
                {h.ourScore != null && h.oppScore != null
                  ? `${h.ourScore} – ${h.oppScore}`
                  : '—'}
              </span>
              <span
                className={`font-bold w-6 text-center ${
                  h.result === 'W'
                    ? 'text-win-green'
                    : h.result === 'L'
                    ? 'text-crimson'
                    : 'text-muted-2'
                }`}
              >
                {h.result ?? '—'}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}

function SectionHeader({
  title,
  accent,
}: {
  title: string
  accent?: 'gold'
}) {
  return (
    <div className="mb-3">
      <h2
        className={`text-sm font-semibold ${
          accent === 'gold' ? 'text-gold' : 'text-fg'
        }`}
      >
        {title}
      </h2>
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  color = 'fg',
}: {
  label: string
  value: string
  sub?: string
  color?: 'gold' | 'win-green' | 'crimson' | 'fg'
}) {
  const fg =
    color === 'gold'
      ? 'text-gold'
      : color === 'win-green'
      ? 'text-win-green'
      : color === 'crimson'
      ? 'text-crimson'
      : 'text-fg'
  return (
    <div>
      <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-1">
        {label}
      </div>
      <div className={`text-xl font-bold tnum ${fg}`}>{value}</div>
      {sub && <div className="text-2xs text-muted-2 tnum mt-0.5">{sub}</div>}
    </div>
  )
}

function Tendency({
  label,
  value,
  sub,
  tone = 'fg',
}: {
  label: string
  value: string
  sub: string
  tone?: 'fg' | 'crimson'
}) {
  return (
    <div className="bg-surface rounded-md px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">
        {label}
      </div>
      <div
        className={`text-lg font-bold tnum ${
          tone === 'crimson' ? 'text-crimson' : 'text-fg'
        }`}
      >
        {value}
      </div>
      <div className="text-2xs text-muted-2 tnum">{sub}</div>
    </div>
  )
}
