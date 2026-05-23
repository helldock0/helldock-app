import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'
import { rehydrateMatch } from '@/lib/henrik/rehydrate'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  // Verify the match belongs to this team
  const { data: match } = await scope.supabase
    .from('matches')
    .select('id')
    .eq('id', params.id)
    .eq('team_id', scope.teamId)
    .single()
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const result = await rehydrateMatch(scope.supabase, params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'matches',
    rowId: params.id,
    changes: { source: 'rehydrate' },
  })

  return NextResponse.json({
    match_id_helldock: result.match_id_helldock,
    rounds_patched: result.rounds_patched,
    match_players_patched: result.match_players_patched,
    match_players_inserted: result.match_players_inserted,
    opp_players_patched: result.opp_players_patched,
    kill_events_inserted: result.kill_events_inserted,
    round_player_stats_inserted: result.round_player_stats_inserted,
  })
}
