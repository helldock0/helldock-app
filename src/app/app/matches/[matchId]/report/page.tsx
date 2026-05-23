import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  computeMatchEfficiency,
  computeTeamAverages,
  withTeamDeltas,
  computeRoundDamageLeaders,
  type RpsRow,
  type EffMatchPlayer,
  type EffRound,
  type PlayerEfficiencyWithDelta,
  type TeamAverages,
  type RoundDamageLeader,
} from '@/lib/efficiency'

export const dynamic = 'force-dynamic'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${Math.round(n)}%`
}

function deltaCell(value: number | null, opts: { invert?: boolean; unit?: string } = {}): JSX.Element {
  if (value == null || !Number.isFinite(value)) return <span className="text-[#6B7280]">—</span>
  const positive = opts.invert ? value < 0 : value > 0
  const cls = value === 0 ? 'text-[#6B7280]' : positive ? 'text-green-400' : 'text-[#DC143C]'
  const sign = value > 0 ? '+' : ''
  return <span className={cls}>{sign}{value.toFixed(2)}{opts.unit ?? ''}</span>
}

export default async function PostScrimReportPage({
  params,
}: {
  params: { matchId: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: match } = await supabase
    .from('matches')
    .select('id, match_id_helldock, map_name, opponent_name, match_date, our_score, opp_score, result, match_type')
    .eq('match_id_helldock', params.matchId)
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .single()

  if (!match) notFound()

  const [
    { data: rpsRaw },
    { data: mpRaw },
    { data: roundsRaw },
  ] = await Promise.all([
    supabase
      .from('round_player_stats')
      .select('match_id, round_num, puuid, is_ours, k, d, damage_made, econ_spent, ability_x_cast')
      .eq('match_id', match.id),
    supabase
      .from('match_players')
      .select('match_id, player_id, puuid, k, damage_made, ability_c, ability_q, ability_e, ability_x, player:players(display_name)')
      .eq('match_id', match.id),
    supabase
      .from('rounds')
      .select('match_id, round_num, round_type, outcome, side')
      .eq('match_id', match.id)
      .order('round_num'),
  ])

  const rps = (rpsRaw ?? []) as RpsRow[]
  const matchPlayers = ((mpRaw ?? []) as unknown as EffMatchPlayer[])
  const rounds = (roundsRaw ?? []) as (EffRound & { side: string | null })[]

  const playersRaw = computeMatchEfficiency(rps, matchPlayers, rounds)
  const team: TeamAverages = computeTeamAverages(playersRaw)
  const players: PlayerEfficiencyWithDelta[] = withTeamDeltas(playersRaw, team)
  const roundLeaders: RoundDamageLeader[] = computeRoundDamageLeaders(rps, matchPlayers, rounds)

  const isWin = match.result === 'W'
  const isLoss = match.result === 'L'

  if (rps.length === 0) {
    return (
      <main className="p-8 max-w-6xl mx-auto">
        <Link
          href={`/app/matches/${params.matchId}`}
          className="text-[#6B7280] text-sm hover:text-white transition-colors mb-4 inline-block"
        >
          ← back to match
        </Link>
        <div className="bg-[#2C2C32] rounded-xl p-8 text-center">
          <h1 className="text-2xl font-bold text-fg mb-2">No round-player data yet</h1>
          <p className="text-muted text-sm">
            This match was ingested before s26. Hit the <span className="font-mono">↻ rehydrate</span> button on the match detail page to backfill it.
          </p>
        </div>
      </main>
    )
  }

  // Sort helpers for the three tables.
  const byDmgDelta = [...players].sort((a, b) => (b.delta.avgDamagePerRound ?? -Infinity) - (a.delta.avgDamagePerRound ?? -Infinity))
  const byUtilEff = [...players].sort((a, b) => (a.utilPerKill ?? Infinity) - (b.utilPerKill ?? Infinity))
  const byEco = [...players].sort((a, b) => (b.ecoSavePct ?? -1) - (a.ecoSavePct ?? -1))

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <Link
        href={`/app/matches/${params.matchId}`}
        className="text-[#6B7280] text-sm hover:text-white transition-colors mb-4 inline-block"
      >
        ← back to match
      </Link>

      {/* Header card */}
      <div className="bg-[#2C2C32] rounded-xl p-6 mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">post-scrim report</p>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-[#6B7280] text-sm">{match.match_id_helldock}</span>
            {match.match_type && (
              <span className="text-xs bg-[#3C3C44] text-[#6B7280] px-2 py-0.5 rounded">{match.match_type}</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">{match.map_name ?? 'Unknown Map'}</h1>
          <p className="text-[#6B7280]">
            {match.opponent_name ?? 'Unknown Opp'}
            {match.match_date && <span className="ml-2">· {formatDate(match.match_date)}</span>}
          </p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <div
            className={`text-5xl font-bold tabular-nums ${
              isWin ? 'text-[#FFD700]' : isLoss ? 'text-[#DC143C]' : 'text-white'
            }`}
          >
            {match.our_score != null && match.opp_score != null
              ? `${match.our_score}–${match.opp_score}`
              : '—'}
          </div>
          <div className={`text-lg font-bold ${isWin ? 'text-[#FFD700]' : isLoss ? 'text-[#DC143C]' : 'text-[#6B7280]'}`}>
            {match.result ?? '—'}
          </div>
        </div>
      </div>

      {/* SECTION 1 — Util efficiency */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-fg mb-1">Util budget</h2>
        <p className="text-xs text-muted mb-3">
          Match-wide ability casts (C+Q+E+X). V4 doesn&rsquo;t expose per-round casts; deltas are vs this match&rsquo;s team avg.
        </p>
        <div className="bg-[#2C2C32] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line">
                <th className="text-left py-2 px-4 font-medium">Player</th>
                <th className="text-right py-2 px-3 font-medium">Casts</th>
                <th className="text-right py-2 px-3 font-medium">Util/Kill</th>
                <th className="text-right py-2 px-3 font-medium">Δ team</th>
                <th className="text-right py-2 px-3 font-medium">Kills/Cast</th>
                <th className="text-right py-2 px-3 font-medium">Util/100Dmg</th>
                <th className="text-right py-2 px-3 font-medium">Ults</th>
                <th className="text-right py-2 px-3 font-medium">Ult kills</th>
              </tr>
            </thead>
            <tbody>
              {byUtilEff.map((p) => (
                <tr key={p.puuid} className="border-b border-line/30 hover:bg-[#3C3C44]/40">
                  <td className="py-2 px-4 font-medium text-fg">{p.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.abilityCasts ?? '—'}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtNum(p.utilPerKill)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{deltaCell(p.delta.utilPerKill, { invert: true })}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtNum(p.killsPerUtilCast)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtNum(p.utilPer100Dmg)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.ultsUsed ?? '—'}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted">{p.ultKillsProxy}</td>
                </tr>
              ))}
              <tr className="border-t border-line-strong bg-[#1B1B1F]/40">
                <td className="py-2 px-4 text-2xs uppercase tracking-wider text-muted-2">team avg</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.abilityCasts, 1)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.utilPerKill)}</td>
                <td />
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.killsPerUtilCast)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.utilPer100Dmg)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.ultsUsed, 1)}</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.ultKillsProxy, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 2 — Eco discipline */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-fg mb-1">Eco discipline</h2>
        <p className="text-xs text-muted mb-3">
          Eco / Anti-Eco rounds only. Save% = % of those rounds the player survived (didn&rsquo;t die).
        </p>
        <div className="bg-[#2C2C32] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line">
                <th className="text-left py-2 px-4 font-medium">Player</th>
                <th className="text-right py-2 px-3 font-medium">Eco rds</th>
                <th className="text-right py-2 px-3 font-medium">Saved</th>
                <th className="text-right py-2 px-3 font-medium">Save%</th>
                <th className="text-right py-2 px-3 font-medium">Δ team</th>
                <th className="text-right py-2 px-3 font-medium">Bonus rds</th>
                <th className="text-right py-2 px-3 font-medium">Bonus W%</th>
                <th className="text-right py-2 px-3 font-medium">Avg econ</th>
              </tr>
            </thead>
            <tbody>
              {byEco.map((p) => (
                <tr key={p.puuid} className="border-b border-line/30 hover:bg-[#3C3C44]/40">
                  <td className="py-2 px-4 font-medium text-fg">{p.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.ecoRoundCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.ecoSurvivedCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtPct(p.ecoSavePct)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{deltaCell(p.delta.ecoSavePct, { unit: 'pp' })}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.bonusRoundCount}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtPct(p.bonusWinPct)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{p.avgEconSpent.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t border-line-strong bg-[#1B1B1F]/40">
                <td className="py-2 px-4 text-2xs uppercase tracking-wider text-muted-2">team avg</td>
                <td colSpan={2} />
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtPct(team.ecoSavePct)}</td>
                <td colSpan={4} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3 — Damage carry (sorted by damage/round delta) */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-fg mb-1">Damage carry</h2>
        <p className="text-xs text-muted mb-3">
          Per-round avg + how many rounds each player led our team in damage.
        </p>
        <div className="bg-[#2C2C32] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line">
                <th className="text-left py-2 px-4 font-medium">Player</th>
                <th className="text-right py-2 px-3 font-medium">Avg dmg/rd</th>
                <th className="text-right py-2 px-3 font-medium">Δ team</th>
                <th className="text-right py-2 px-3 font-medium">Top round</th>
                <th className="text-right py-2 px-3 font-medium">Led rounds</th>
              </tr>
            </thead>
            <tbody>
              {byDmgDelta.map((p) => (
                <tr key={p.puuid} className="border-b border-line/30 hover:bg-[#3C3C44]/40">
                  <td className="py-2 px-4 font-medium text-fg">{p.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtNum(p.avgDamagePerRound, 1)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{deltaCell(p.delta.avgDamagePerRound)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {p.topRoundDamage > 0 ? (
                      <span>
                        <span className="text-fg">{p.topRoundDamage}</span>
                        <span className="text-muted text-2xs ml-1">R{p.topRoundNum}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {p.damageLeaderRounds > 0 ? (
                      <span className="text-gold font-medium">{p.damageLeaderRounds}</span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line-strong bg-[#1B1B1F]/40">
                <td className="py-2 px-4 text-2xs uppercase tracking-wider text-muted-2">team avg</td>
                <td className="py-2 px-3 text-right tabular-nums text-muted">{fmtNum(team.avgDamagePerRound, 1)}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 4 — Per-round damage leaders */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-fg mb-1">Per-round leaders</h2>
        <p className="text-xs text-muted mb-3">
          Top damage dealer on our side for each round.
        </p>
        <div className="bg-[#2C2C32] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line">
                <th className="text-left py-2 px-3 font-medium">Rd</th>
                <th className="text-left py-2 px-3 font-medium">Type</th>
                <th className="text-center py-2 px-3 font-medium">Outcome</th>
                <th className="text-left py-2 px-3 font-medium">Leader</th>
                <th className="text-right py-2 px-3 font-medium">Dmg</th>
                <th className="text-left py-2 px-3 font-medium">2nd</th>
                <th className="text-right py-2 px-3 font-medium">Dmg</th>
                <th className="text-left py-2 px-3 font-medium">3rd</th>
                <th className="text-right py-2 px-3 font-medium">Dmg</th>
              </tr>
            </thead>
            <tbody>
              {roundLeaders.map((rl) => {
                const win = rl.outcome === 'W'
                const loss = rl.outcome === 'L'
                return (
                  <tr key={rl.round_num} className="border-b border-line/30 hover:bg-[#3C3C44]/40">
                    <td className="py-1.5 px-3 font-mono text-muted">{rl.round_num}</td>
                    <td className="py-1.5 px-3 text-2xs text-muted">{rl.round_type ?? '—'}</td>
                    <td className="py-1.5 px-3 text-center">
                      <span
                        className={`inline-block w-5 text-2xs font-bold ${
                          win ? 'text-[#FFD700]' : loss ? 'text-[#DC143C]' : 'text-muted'
                        }`}
                      >
                        {rl.outcome ?? '—'}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 font-medium text-fg">{rl.leader?.name ?? '—'}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-gold">{rl.leader?.damage ?? '—'}</td>
                    <td className="py-1.5 px-3 text-muted">{rl.ranked[1]?.name ?? '—'}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted">{rl.ranked[1]?.damage ?? '—'}</td>
                    <td className="py-1.5 px-3 text-muted">{rl.ranked[2]?.name ?? '—'}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted">{rl.ranked[2]?.damage ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
