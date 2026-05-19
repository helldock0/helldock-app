import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

const ALLOWED_STATUSES = new Set(['scheduled', 'cancelled', 'completed'])
const PATCH_FIELDS = [
  'scheduled_at',
  'opponent_name',
  'map_planned',
  'match_format',
  'notes',
  'status',
  'match_id',
] as const

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { teamId } = await requireSelectedTeam()
  const body = await req.json()
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  for (const key of PATCH_FIELDS) {
    if (key in body) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('scrim_schedule')
    .update(updates)
    .eq('id', params.id)
    .eq('team_id', teamId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()
  const { error } = await supabase
    .from('scrim_schedule')
    .delete()
    .eq('id', params.id)
    .eq('team_id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
