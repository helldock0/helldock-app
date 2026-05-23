import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

const ALLOWED_STATUSES = new Set(['scheduled', 'cancelled', 'completed'])

export async function POST(req: Request) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const body = await req.json()

  if (!body?.scheduled_at || typeof body.scheduled_at !== 'string') {
    return NextResponse.json(
      { error: 'scheduled_at is required (ISO string)' },
      { status: 400 }
    )
  }
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const { data, error } = await scope.supabase
    .from('scrim_schedule')
    .insert({
      team_id: scope.teamId,
      scheduled_at: body.scheduled_at,
      opponent_name: body.opponent_name ?? null,
      map_planned: body.map_planned ?? null,
      match_format: body.match_format ?? null,
      notes: body.notes ?? null,
      status: body.status ?? 'scheduled',
      match_id: body.match_id ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'insert',
    table: 'scrim_schedule',
    rowId: data.id,
    changes: { scheduled_at: data.scheduled_at, opponent: data.opponent_name },
  })

  return NextResponse.json(data)
}
