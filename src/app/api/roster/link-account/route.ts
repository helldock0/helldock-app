import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { match_player_id, target_player_id } = (await req.json()) as LinkPayload
  if (!match_player_id || !target_player_id) {
    return NextResponse.json(
      { error: 'match_player_id and target_player_id required' },
      { status: 400 }
    )
  }

  const { data: target } = await supabase
    .from('players')
    .select('id, display_name')
    .eq('id', target_player_id)
    .single()
  if (!target) {
    return NextResponse.json({ error: 'target player not found' }, { status: 404 })
  }

  const { data: updated, error } = await supabase
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

  return NextResponse.json({
    linked: 1,
    target: target.display_name,
  })
}
