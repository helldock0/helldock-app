import { NextResponse } from 'next/server'
import { requireTeamScope, stripFields } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

const FORBIDDEN_FIELDS = ['id', 'match_id', 'created_at'] as const

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  // Verify the round belongs to a match owned by this team
  const { data: round } = await scope.supabase
    .from('rounds')
    .select('match_id')
    .eq('id', params.id)
    .single()
  if (!round) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: match } = await scope.supabase
    .from('matches')
    .select('id')
    .eq('id', round.match_id)
    .eq('team_id', scope.teamId)
    .single()
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json()) as Record<string, unknown>
  const updates = stripFields(body, FORBIDDEN_FIELDS)

  const { data, error } = await scope.supabase
    .from('rounds')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'rounds',
    rowId: params.id,
    changes: updates,
  })

  return NextResponse.json(data)
}
