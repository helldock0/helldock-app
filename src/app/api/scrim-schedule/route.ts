import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

const ALLOWED_STATUSES = new Set(['scheduled', 'cancelled', 'completed'])

export async function POST(req: Request) {
  const { teamId } = await requireSelectedTeam()
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

  const supabase = createClient()
  const { data, error } = await supabase
    .from('scrim_schedule')
    .insert({
      team_id: teamId,
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
  return NextResponse.json(data)
}
