import { NextResponse } from 'next/server'
import { requireTeamScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

type LinkPayload = {
  match_player_id: string
  target_player_id: string
}

/**
 * Per-match link: assigns this one match_players row to a roster player.
 *
 * Does NOT touch other matches with the same Riot ID, and does NOT add to
 * player_accounts. Every match's roster mapping is independent — the user
 * decides per-match whether an unknown Riot ID is one of their players.
 *
 * To get auto-attribution for future imports of a recurring alt, add the
 * Riot ID via the /roster Players tab → "Add alt account".
 */
export async function POST(req: Request) {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const { match_player_id, target_player_id } = (await req.json()) as LinkPayload
  if (!match_player_id || !target_player_id) {
    return NextResponse.json(
      { error: 'match_player_id and target_player_id required' },
      { status: 400 }
    )
  }

  // Verify target player belongs to this team
  const { data: target } = await scope.supabase
    .from('players')
    .select('id, display_name')
    .eq('id', target_player_id)
    .eq('team_id', scope.teamId)
    .single()
  if (!target) {
    return NextResponse.json({ error: 'target player not found' }, { status: 404 })
  }

  // Verify match_player belongs to a match owned by this team
  const { data: mp } = await scope.supabase
    .from('match_players')
    .select('match_id')
    .eq('id', match_player_id)
    .single()
  if (!mp) return NextResponse.json({ error: 'match_player not found' }, { status: 404 })

  const { data: match } = await scope.supabase
    .from('matches')
    .select('id')
    .eq('id', mp.match_id)
    .eq('team_id', scope.teamId)
    .single()
  if (!match) return NextResponse.json({ error: 'match_player not found' }, { status: 404 })

  const { data: updated, error } = await scope.supabase
    .from('match_players')
    .update({ player_id: target_player_id })
    .eq('id', match_player_id)
    .select('id')
    .single()

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'Update failed' },
      { status: 400 }
    )
  }

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'match_players',
    rowId: match_player_id,
    changes: { player_id: target_player_id },
  })

  return NextResponse.json({
    linked: 1,
    target: target.display_name,
  })
}
