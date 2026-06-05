import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import { getCurrentUserContext } from '@/lib/authz'
import { cleanOpponentName } from '@/lib/opponent-name'

export const dynamic = 'force-dynamic'

type MatchRow = {
  id: string
  match_id_helldock: string
  match_date: string
  opponent_name: string | null
  map_name: string | null
  result: string | null
  our_score: number
  opp_score: number
}

type MyStat = {
  match: MatchRow
  k: number | null
  a: number | null
  d: number | null
  acs: number | null
  agent: string | null
  rating: number | null
}

export default async function MePage() {
  const ctx = await getCurrentUserContext()
  if (!ctx) return null
  const { teamId, teamName } = await requireSelectedTeam()

  // Find user's linked player_id on the current team
  const myTeam = ctx.memberships
    .flatMap((o) => o.teams)
    .find((t) => t.teamId === teamId)
  const playerId = myTeam?.playerId ?? null
  const selectedOrg = ctx.memberships.find((o) => o.teams.some((t) => t.teamId === teamId))
  const canOpenRoster =
    ctx.isPlatformAdmin ||
    myTeam?.teamRole === 'coach' ||
    myTeam?.teamRole === 'analyst' ||
    selectedOrg?.orgRole === 'org_admin' ||
    selectedOrg?.orgRole === 'org_owner'
  const canOpenMembers =
    ctx.isPlatformAdmin ||
    selectedOrg?.orgRole === 'org_admin' ||
    selectedOrg?.orgRole === 'org_owner'

  if (!playerId) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-fg mb-2">My stats</h1>
        <p className="text-muted text-sm mb-6">
          Showing <span className="text-gold">{teamName}</span>
        </p>
        <div className="rounded-2xl border border-line-strong/40 bg-surface-2 p-8 text-center">
          <p className="text-fg mb-2">No player profile linked to your account.</p>
          <p className="text-muted text-sm max-w-md mx-auto">
            {canOpenRoster || canOpenMembers
              ? 'Link this email to a roster player from Members, or confirm the player exists in Roster.'
              : 'Ask a coach or org admin to link your account to the matching roster player.'}
          </p>
          {(canOpenMembers || canOpenRoster) && (
            <div className="mt-6 flex items-center justify-center gap-3">
              {canOpenMembers && (
                <Link
                  href="/app/team/members"
                  className="px-4 py-2 bg-gold text-black font-semibold rounded-lg text-sm hover:bg-gold-hover transition-colors"
                >
                  Open members
                </Link>
              )}
              {canOpenRoster && (
                <Link
                  href="/app/roster"
                  className="px-4 py-2 border border-line-strong text-fg font-semibold rounded-lg text-sm hover:border-gold transition-colors"
                >
                  Open roster
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const supabase = createClient()
  const { data: mpRows } = await supabase
    .from('match_players')
    .select(`
      id, kills, assists, deaths, acs, agent, rating,
      matches!inner(id, match_id_helldock, match_date, opponent_name, map_name, result, our_score, opp_score, team_id, deleted_at)
    `)
    .eq('player_id', playerId)
    .order('match_date', { ascending: false, referencedTable: 'matches' })
    .limit(20)

  const stats: MyStat[] = (mpRows ?? [])
    .map((r) => {
      const m = r.matches as unknown as MatchRow & { team_id: string; deleted_at: string | null }
      if (m.team_id !== teamId || m.deleted_at) return null
      return {
        match: {
          id: m.id,
          match_id_helldock: m.match_id_helldock,
          match_date: m.match_date,
          opponent_name: m.opponent_name,
          map_name: m.map_name,
          result: m.result,
          our_score: m.our_score,
          opp_score: m.opp_score,
        },
        k: r.kills,
        a: r.assists,
        d: r.deaths,
        acs: r.acs,
        agent: r.agent,
        rating: r.rating,
      }
    })
    .filter((x): x is MyStat => x !== null)
    .slice(0, 10)

  // Summary cards
  const playedStats = stats.filter((s) => s.k !== null && s.acs !== null)
  const avgK = playedStats.length ? avg(playedStats.map((s) => s.k!)) : null
  const avgD = playedStats.length ? avg(playedStats.map((s) => s.d!)) : null
  const avgACS = playedStats.length ? avg(playedStats.map((s) => s.acs!)) : null
  const wins = stats.filter((s) => s.match.result === 'W').length

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold text-fg mb-2">My stats</h1>
      <p className="text-muted text-sm mb-8">
        Last {stats.length} matches on <span className="text-gold">{teamName}</span>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Card label="Matches" value={stats.length.toString()} />
        <Card label="Record" value={`${wins}-${stats.length - wins}`} />
        <Card label="Avg ACS" value={avgACS !== null ? avgACS.toFixed(0) : '—'} />
        <Card label="Avg K/D" value={avgK !== null && avgD !== null && avgD > 0 ? (avgK / avgD).toFixed(2) : '—'} />
      </div>

      {stats.length === 0 ? (
        <p className="text-muted">No matches yet.</p>
      ) : (
        <div className="rounded-2xl border border-line-strong/40 bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
              <tr>
                <th className="text-left px-4 py-2">Match</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-left px-4 py-2">Map</th>
                <th className="text-left px-4 py-2">Opp</th>
                <th className="text-left px-4 py-2">Agent</th>
                <th className="text-right px-4 py-2 tnum">Score</th>
                <th className="text-right px-4 py-2 tnum">K/D/A</th>
                <th className="text-right px-4 py-2 tnum">ACS</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr
                  key={s.match.id}
                  className="border-t border-line/40 hover:bg-surface-3 transition-colors"
                >
                  <td className="px-4 py-2 text-gold font-mono">{s.match.match_id_helldock}</td>
                  <td className="px-4 py-2 text-muted tnum">{s.match.match_date}</td>
                  <td className="px-4 py-2">{s.match.map_name ?? '—'}</td>
                  <td className="px-4 py-2 text-muted">
                    {cleanOpponentName(s.match.opponent_name) ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-muted">{s.agent ?? '—'}</td>
                  <td className="px-4 py-2 text-right tnum">
                    <span className={s.match.result === 'W' ? 'text-win-green' : s.match.result === 'L' ? 'text-crimson' : 'text-muted'}>
                      {s.match.our_score}-{s.match.opp_score}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tnum">
                    {s.k ?? '—'}/{s.d ?? '—'}/{s.a ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right tnum">{s.acs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/40 bg-surface-2 p-4">
      <div className="text-2xs uppercase tracking-[0.2em] text-muted-2 mb-1">{label}</div>
      <div className="text-2xl font-bold text-fg tnum">{value}</div>
    </div>
  )
}

function avg(nums: number[]): number {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
