import { requireSelectedTeam } from '@/lib/team-session'
import { createClient } from '@/lib/supabase/server'
import ImportClient from './ImportClient'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const { teamId, teamSlug, teamName } = await requireSelectedTeam()
  const supabase = createClient()
  const { data: rehydratable } = await supabase
    .from('matches')
    .select('id, match_id_helldock, henrik_id')
    .eq('team_id', teamId)
    .not('henrik_id', 'is', null)
    .is('deleted_at', null)
    .order('match_date', { ascending: false })

  return (
    <ImportClient
      lockedTeamSlug={teamSlug}
      lockedTeamName={teamName}
      rehydratableMatches={(rehydratable ?? []).map((m: { id: string; match_id_helldock: string }) => ({
        id: m.id,
        match_id_helldock: m.match_id_helldock,
      }))}
    />
  )
}
