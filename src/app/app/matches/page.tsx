import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import MatchesTable from './MatchesTable'

export default async function MatchesPage() {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: matches } = await supabase
    .from('matches')
    .select('id, match_id_helldock, match_date, match_type, opponent_name, map_name, our_score, opp_score, result')
    .is('deleted_at', null)
    .eq('team_id', teamId)
    .order('match_date', { ascending: false })
    .limit(50)

  return (
    <main className="px-6 py-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">log</p>
        <h1 className="text-2xl font-bold text-fg leading-tight mt-1">Matches</h1>
      </div>
      <MatchesTable matches={matches ?? []} />
    </main>
  )
}
