import { createClient } from '@/lib/supabase/server'
import { rehydrateMatch } from '@/lib/henrik/rehydrate'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await rehydrateMatch(supabase, params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // Strip the discriminator from the response so existing clients see the same shape.
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
