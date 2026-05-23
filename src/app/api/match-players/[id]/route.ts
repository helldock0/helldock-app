import { NextResponse } from 'next/server'
import { requireTeamWriteScope, stripFields } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

const FORBIDDEN_FIELDS = ['id', 'match_id', 'player_id', 'created_at'] as const

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  // Verify the match_player belongs to a match owned by this team
  const { data: mp } = await scope.supabase
    .from('match_players')
    .select('match_id')
    .eq('id', params.id)
    .single()
  if (!mp) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: match } = await scope.supabase
    .from('matches')
    .select('id')
    .eq('id', mp.match_id)
    .eq('team_id', scope.teamId)
    .single()
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json()) as Record<string, unknown>
  const updates = stripFields(body, FORBIDDEN_FIELDS)

  const { data, error } = await scope.supabase
    .from('match_players')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'match_players',
    rowId: params.id,
    changes: updates,
  })

  return NextResponse.json(data)
}
