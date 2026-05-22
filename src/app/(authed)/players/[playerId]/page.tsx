import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  computePlayerStats,
  mergePlayerImpact,
  type FullMatchPlayer,
} from '@/lib/analytics'
import {
  computePlayerImpact,
  type ImpactMatchPlayer,
  type ImpactKillEvent,
} from '@/lib/impact'
import {
  computePerOpponent,
  computePerAgent,
  computeMatchHistory,
  type PlayerMatchRow,
} from '@/lib/player-profile'
import type { DashMatch } from '@/lib/dashboard'
import RatingTrendChart from '@/components/charts/RatingTrendChart'
import {
  computeInternalPlayerDossier,
  fetchFocalKillEvents,
} from '@/lib/dossier/internal-player'
import IgnAvatar from '@/components/pro-scout/player/IgnAvatar'
import RadarPizzaChart from '@/components/pro-scout/player/RadarPizzaChart'
import TopPercentilesList from '@/components/pro-scout/player/TopPercentilesList'
import SimilarPlayersList from '@/components/pro-scout/player/SimilarPlayersList'
import AgentMapGrid from '@/components/pro-scout/player/AgentMapGrid'
import PeerScatterPlot from '@/components/pro-scout/player/PeerScatterPlot'
import PitchHeatmapStrip, {
  type DossierMapTile,
} from '@/components/dossier/PitchHeatmapStrip'
import type { SimilarPlayer } from '@/lib/pro-scout/types'
import type { Map as ValMap } from '@/lib/valorant'
import { MAPS } from '@/lib/valorant'

export const dynamic = 'force-dynamic'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fmtPct(p: number | null): string {
  return p == null ? '—' : `${p}%`
}

function fmtNum(n: number | null, digits = 0): string {
  if (n == null) return '—'
  return digits > 0 ? n.toFixed(digits) : Math.round(n).toString()
}

export default async function PlayerProfilePage({
  params,
}: {
  params: { playerId: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const playerId = decodeURIComponent(params.playerId)
  const supabase = createClient()

  // Verify this player exists and is on the team's roster (i.e. has at least
  // one match_player row in a team match).
  const { data: playerRow } = await supabase
    .from('players')
    .select('id, display_name')
    .eq('id', playerId)
    .single()
  if (!playerRow) notFound()

  // Pull all team matches + the data we need to compute aggregates.
  const { data: matchesRaw } = await supabase
    .from('matches')
    .select(
      'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result, our_agents'
    )
    .eq('team_id', teamId)
    .is('deleted_at', null)
  const matches: DashMatch[] = matchesRaw ?? []
  const matchIds = matches.map((m) => m.id)
  if (matchIds.length === 0) notFound()

  const [mpRes, roundsRes, killRes] = await Promise.all([
    supabase
      .from('match_players')
      .select(
        'match_id, player_id, puuid, k, d, a, acs, plus_minus, agent, fk, fd, plants, defuses, clutches, clutch_1v2plus, econ, hs, bs, ls, damage_made, damage_received, adr, ability_c, ability_q, ability_e, ability_x, rounds_afk, friendly_fire_outgoing, friendly_fire_incoming, two_k, three_k, four_k, aces, player:players(display_name)'
      )
      .in('match_id', matchIds),
    supabase
      .from('rounds')
      .select('match_id, round_num, outcome, plant_time_in_round')
      .in('match_id', matchIds),
    supabase
      .from('kill_events')
      .select(
        'match_id, round_num, killer_puuid, victim_puuid, killer_is_ours, ts_in_round_ms'
      )
      .in('match_id', matchIds),
  ])

  const matchPlayersRaw = (mpRes.data ?? []) as unknown as FullMatchPlayer[]
  const impactRounds = ((roundsRes.data ?? []) as Array<{
    match_id: string
    round_num: number
    outcome: string | null
    plant_time_in_round: number | null
  }>).map((r) => ({
    match_id: r.match_id,
    round_num: r.round_num,
    outcome: r.outcome,
    plant_time_in_round: r.plant_time_in_round ?? null,
  }))
  const kills = (killRes.data ?? []) as unknown as ImpactKillEvent[]

  // Did this player ever play? If not, no profile to show.
  if (!matchPlayersRaw.some((mp) => mp.player_id === playerId)) notFound()

  // Run the analytics computes once across the team, then filter to this player.
  const playerStats = computePlayerStats(matches, matchPlayersRaw)
  const impactInput: ImpactMatchPlayer[] = matchPlayersRaw.map((mp) => ({
    match_id: mp.match_id,
    player_id: mp.player_id,
    puuid: mp.puuid ?? null,
    player: mp.player,
    acs: mp.acs,
    adr: mp.adr ?? null,
  }))
  const impacts = computePlayerImpact(impactInput, impactRounds, kills)
  const impactByPlayerId = Object.fromEntries(impacts.map((i) => [i.playerId, i]))
  const merged = mergePlayerImpact(playerStats, impactByPlayerId)
  const me = merged.find((p) => p.playerId === playerId)
  if (!me) notFound()

  // Per-opponent / per-agent / match-history aggregates need raw rows.
  // The `a` column isn't typed on FullMatchPlayer yet but Supabase returns it
  // when selected — read it via index access rather than re-typing the union.
  const playerRows: PlayerMatchRow[] = matchPlayersRaw.map((mp) => ({
    match_id: mp.match_id,
    player_id: mp.player_id,
    agent: mp.agent,
    acs: mp.acs,
    k: mp.k,
    d: mp.d,
    a: ((mp as unknown) as { a?: number | null }).a ?? null,
  }))
  const perOpp = computePerOpponent(playerId, matches, playerRows)
  const perAgent = computePerAgent(playerId, matches, playerRows)
  const history = computeMatchHistory(playerId, matches, playerRows)
  const recordW = history.filter((h) => h.result === 'W').length
  const recordL = history.filter((h) => h.result === 'L').length
  const overallWinPct =
    me.games > 0 ? Math.round((recordW / me.games) * 1000) / 10 : null

  // ── Dossier overview ──
  const dossier = await computeInternalPlayerDossier(
    supabase as unknown as Parameters<typeof computeInternalPlayerDossier>[0],
    playerId
  )
  let heatmapTiles: DossierMapTile[] = []
  if (dossier && dossier.topMaps.length > 0) {
    const validMaps = (MAPS as readonly string[])
    const wantedMaps = dossier.topMaps
      .filter((m) => validMaps.includes(m.mapName))
      .map((m) => m.mapName)
    if (wantedMaps.length > 0 && dossier.focal.puuids.length > 0) {
      const killsByMap = await fetchFocalKillEvents(
        supabase as unknown as Parameters<typeof fetchFocalKillEvents>[0],
        dossier.focal.puuids,
        wantedMaps
      )
      heatmapTiles = dossier.topMaps
        .filter((m) => validMaps.includes(m.mapName))
        .map((m) => ({
          mapName: m.mapName as ValMap,
          played: m.played,
          kills: killsByMap.get(m.mapName) ?? [],
        }))
    }
  }
  const similarHref = (sp: SimilarPlayer): string =>
    sp.linkId ? `/players/${sp.linkId}` : '#'

  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <Link
          href="/analytics?tab=players"
          className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
        >
          ← all players
        </Link>
        <p className="mt-1 text-2xs uppercase tracking-[0.25em] text-muted-2">
          player profile
        </p>
        <h1 className="text-3xl font-bold text-fg leading-tight">{me.name}</h1>
      </div>

      {/* Header strip — now with avatar + signature agent + role */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <div className="flex flex-wrap items-start gap-5 mb-4">
          <IgnAvatar ign={me.name} size={72} />
          <div className="flex-1 min-w-0">
            <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-1">
              {dossier?.focal.primaryRole ?? me.topAgent?.agent ?? 'flex'}
              {dossier?.focal.teamName && ` · ${dossier.focal.teamName}`}
            </p>
            <h2 className="text-2xl font-bold text-fg leading-tight">{me.name}</h2>
            {dossier?.focal.signatureAgent && (
              <p className="text-xs text-muted mt-1">
                signature{' '}
                <span className="text-fg">{dossier.focal.signatureAgent.agent}</span> (
                ×{dossier.focal.signatureAgent.count})
                {dossier.focal.topAgents.length > 1 && (
                  <span className="text-muted-2 ml-2">
                    pool:{' '}
                    {dossier.focal.topAgents.slice(0, 4).map((a) => `${a.agent}×${a.count}`).join(' · ')}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-center">
          <Stat label="Played" value={String(me.games)} />
          <Stat
            label="Record"
            value={`${recordW}–${recordL}`}
            color={recordW > recordL ? 'win-green' : recordW < recordL ? 'crimson' : 'fg'}
          />
          <Stat label="Win %" value={fmtPct(overallWinPct)} color="gold" />
          <Stat label="Avg ACS" value={fmtNum(me.avgAcs)} color="gold" />
          <Stat
            label="Rating 2.0"
            value={fmtNum(me.rating2, 2)}
            color={me.rating2 != null && me.rating2 >= 1.0 ? 'win-green' : 'fg'}
          />
        </div>
        {dossier?.sample === 'small' && (
          <div className="mt-4 text-2xs uppercase tracking-wider text-crimson border border-crimson/40 bg-crimson/5 rounded-md px-3 py-2 inline-block">
            small sample ({dossier.focal.maps} maps) — percentiles below are unreliable
          </div>
        )}
      </section>

      {/* Dossier overview — radar / similars / grid / scatter / heatmap */}
      {dossier && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 mb-6">
            <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
              <SectionHeader title="Percentile profile" />
              <p className="text-2xs uppercase tracking-wider text-muted-2 -mt-2 mb-3">
                vs {dossier.focal.primaryRole ?? 'all'} peers across all scrim
                match_players · 0–100
              </p>
              <RadarPizzaChart slices={dossier.slices} />
            </section>
            <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
              <SectionHeader title="Top 5 percentiles" />
              <TopPercentilesList slices={dossier.topPercentiles} />
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 mb-6">
            <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
              <SectionHeader title="Most similar" />
              <p className="text-2xs uppercase tracking-wider text-muted-2 -mt-2 mb-3">
                cosine on percentile vector
              </p>
              <SimilarPlayersList
                players={dossier.similarPlayers}
                hrefFor={similarHref}
              />
            </section>
            <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
              <SectionHeader title="Agent × map" />
              <p className="text-2xs uppercase tracking-wider text-muted-2 -mt-2 mb-3">
                avg ACS · darker = higher · hover for detail
              </p>
              <AgentMapGrid
                agents={dossier.agentMapGrid.agents}
                maps={dossier.agentMapGrid.maps}
                cells={dossier.agentMapGrid.cells}
                minAcs={dossier.agentMapGrid.minAcs}
                maxAcs={dossier.agentMapGrid.maxAcs}
              />
            </section>
          </div>

          <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
            <SectionHeader title="Peer cloud" />
            <p className="text-2xs uppercase tracking-wider text-muted-2 -mt-2 mb-3">
              K/D × ACS · {dossier.peerScatter.length - 1}{' '}
              {dossier.focal.primaryRole ?? 'overall'} peers · {me.name} in gold
            </p>
            <PeerScatterPlot points={dossier.peerScatter} />
          </section>

          {heatmapTiles.length > 0 && (
            <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
              <SectionHeader title="Kill positions" />
              <p className="text-2xs uppercase tracking-wider text-muted-2 -mt-2 mb-3">
                top {heatmapTiles.length} maps · dots at victim position
              </p>
              <PitchHeatmapStrip tiles={heatmapTiles} />
            </section>
          )}
        </>
      )}

      {/* Impact + consistency */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Impact · consistency" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Mini label="KST%" value={fmtPct(me.kstPct)} sub={`n=${me.kstSample} rounds`} />
          <Mini
            label="OpDuel W%"
            value={fmtPct(me.opDuelWPct)}
            sub={`${me.opDuelWins}–${me.opDuelLosses}`}
          />
          <Mini label="2K → W%" value={fmtPct(me.twoKWinPct)} sub={`n=${me.twoKSample}`} />
          <Mini
            label="3K+ → W%"
            value={fmtPct(me.threeKPlusWinPct)}
            sub={`n=${me.threeKPlusSample}`}
          />
          <Mini
            label="ACS CV"
            value={me.acsCv == null ? '—' : `${me.acsCv}%`}
            sub={
              me.acsCv != null && me.acsCv < 15
                ? 'steady'
                : me.acsCv != null && me.acsCv < 25
                ? 'normal'
                : 'streaky'
            }
          />
          <Mini
            label="Trade rate"
            value={fmtPct(me.tradeRate)}
            sub={`${me.deathsTraded}/${me.totalDeathsTracked} deaths`}
          />
          <Mini
            label="Drag"
            value={
              me.drag == null
                ? '—'
                : `${me.drag > 0 ? '+' : ''}${me.drag}pp`
            }
            sub="P(loss|dead) − P(loss|alive)"
          />
          <Mini
            label="Carry"
            value={
              me.carry == null
                ? '—'
                : `${me.carry > 0 ? '+' : ''}${me.carry}pp`
            }
            sub="W% with kill − W% without"
          />
          <Mini
            label="Pre-plant K"
            value={String(me.prePlantKills ?? 0)}
            sub="(ATT entry frags)"
          />
          <Mini
            label="Post-plant K"
            value={String(me.postPlantKills ?? 0)}
            sub="(holding plant)"
          />
          <Mini
            label="FB +/−"
            value={
              me.avgFk == null || me.avgFd == null
                ? '—'
                : `${(me.avgFk - me.avgFd).toFixed(1)}/g`
            }
            sub={`${fmtNum(me.avgFk, 1)} for / ${fmtNum(me.avgFd, 1)} against`}
          />
          <Mini
            label="HS %"
            value={me.hsPct == null ? '—' : `${me.hsPct}%`}
            sub={me.avgAdr == null ? '' : `ADR ${fmtNum(me.avgAdr)}`}
          />
        </div>
      </section>

      {/* Rating trend chart */}
      {me.ratingHistory.length >= 2 && (
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
          <SectionHeader title="Rating over time" />
          <RatingTrendChart points={me.ratingHistory} />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* Per-agent record */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Agents" />
          {perAgent.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {perAgent.map((a) => (
                <div
                  key={a.agent}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-sm py-1.5 px-2 rounded hover:bg-surface-3"
                >
                  <span className="text-fg font-medium truncate">{a.agent}</span>
                  <span className="text-2xs text-muted-2 tnum">n={a.played}</span>
                  <span className="font-mono text-xs tnum text-muted">
                    <span className="text-win-green">{a.wins}</span>–
                    <span className="text-crimson">{a.losses}</span>
                  </span>
                  <span
                    className={`tnum font-bold w-12 text-right ${
                      a.winPct == null
                        ? 'text-muted-2'
                        : a.winPct >= 60
                        ? 'text-win-green'
                        : a.winPct >= 40
                        ? 'text-gold'
                        : 'text-crimson'
                    }`}
                  >
                    {fmtPct(a.winPct)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Per-map ACS — already on PlayerStat */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Per-map ACS" />
          {me.perMapAcs.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-1.5">
              {me.perMapAcs.map((m) => (
                <div
                  key={m.map}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm py-1.5 px-2 rounded hover:bg-surface-3"
                >
                  <span className="text-fg font-medium truncate">{m.map}</span>
                  <span className="text-2xs text-muted-2 tnum">n={m.games}</span>
                  <span className="text-gold tnum font-bold w-14 text-right">
                    {fmtNum(m.avgAcs)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Per-opponent record */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Per opponent" />
        {perOpp.length === 0 ? (
          <p className="text-sm text-muted-2">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
                  <th className="text-left px-3 py-2 font-semibold">Opponent</th>
                  <th className="text-center px-3 py-2 font-semibold">G</th>
                  <th className="text-right px-3 py-2 font-semibold">Record</th>
                  <th className="text-right px-3 py-2 font-semibold">Win %</th>
                  <th className="text-right px-3 py-2 font-semibold">Avg ACS</th>
                </tr>
              </thead>
              <tbody>
                {perOpp.slice(0, 12).map((o, i) => (
                  <tr
                    key={o.opp}
                    className={i !== perOpp.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td className="px-3 py-2 text-fg">
                      <Link
                        href={`/opponents/${encodeURIComponent(o.opp)}`}
                        className="hover:text-gold transition-colors"
                      >
                        {o.opp}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center text-muted tnum">{o.played}</td>
                    <td className="px-3 py-2 text-right font-mono tnum">
                      <span className="text-win-green">{o.wins}</span>
                      <span className="text-muted-2">–</span>
                      <span className="text-crimson">{o.losses}</span>
                    </td>
                    <td
                      className={`px-3 py-2 text-right tnum font-bold ${
                        o.winPct == null
                          ? 'text-muted-2'
                          : o.winPct >= 60
                          ? 'text-win-green'
                          : o.winPct >= 40
                          ? 'text-gold'
                          : 'text-crimson'
                      }`}
                    >
                      {fmtPct(o.winPct)}
                    </td>
                    <td className="px-3 py-2 text-right text-gold tnum">
                      {fmtNum(o.avgAcs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Match history */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
        <SectionHeader title="Match history" />
        <div className="space-y-1">
          {history.map((h) => (
            <Link
              key={h.matchId}
              href={`/matches/${h.matchId}`}
              className="flex items-center justify-between gap-3 text-xs px-3 py-1.5 rounded-md bg-surface hover:bg-surface-3 transition-colors"
            >
              <span className="font-mono text-gold tnum w-14">{h.matchId}</span>
              <span className="text-muted tnum w-24">{formatDate(h.date)}</span>
              <span className="text-fg flex-1 truncate">
                {h.map ?? '—'}
                {h.opp && (
                  <span className="text-muted-2 ml-2">vs {h.opp}</span>
                )}
                {h.agent && (
                  <span className="text-2xs uppercase tracking-wider text-muted-2 ml-2">
                    {h.agent}
                  </span>
                )}
              </span>
              <span className="font-mono tnum text-fg w-20 text-right">
                {h.k ?? '—'}/{h.d ?? '—'}/{h.a ?? '—'}
              </span>
              <span className="font-mono tnum text-gold w-12 text-right">
                {fmtNum(h.acs)}
              </span>
              <span className="font-mono tnum text-fg w-16 text-right">
                {h.ourScore != null && h.oppScore != null
                  ? `${h.ourScore}–${h.oppScore}`
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

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
    </div>
  )
}

function Stat({
  label,
  value,
  color = 'fg',
}: {
  label: string
  value: string
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
    </div>
  )
}

function Mini({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-surface rounded-md px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">
        {label}
      </div>
      <div className="text-lg font-bold tnum text-fg">{value}</div>
      {sub && <div className="text-2xs text-muted-2 mt-0.5">{sub}</div>}
    </div>
  )
}
