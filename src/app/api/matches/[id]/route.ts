import { NextResponse } from 'next/server'
import { requireTeamScope, stripFields } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

const FORBIDDEN_FIELDS = ['id', 'team_id', 'created_at', 'henrik_id', 'match_id_helldock'] as const

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const body = (await req.json()) as Record<string, unknown>
  const updates = stripFields(body, FORBIDDEN_FIELDS)

  // Auto-derive result if scores are being updated
  if (updates.our_score !== undefined && updates.opp_score !== undefined) {
    const ours = updates.our_score as number
    const opp = updates.opp_score as number
    updates.result = ours > opp ? 'W' : ours < opp ? 'L' : null
  }

  const { data, error } = await scope.supabase
    .from('matches')
    .update(updates)
    .eq('id', params.id)
    .eq('team_id', scope.teamId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'matches',
    rowId: params.id,
    changes: updates,
  })

  return NextResponse.json(data)
}
