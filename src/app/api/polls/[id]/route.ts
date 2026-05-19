import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

// DELETE /api/polls/[id] — coach removes a poll (cascade clears responses)
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()
  const { error } = await supabase
    .from('availability_poll')
    .delete()
    .eq('id', params.id)
    .eq('team_id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/polls/[id] — coach edits title/notes
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { teamId } = await requireSelectedTeam()
  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if ('title' in body) updates.title = body.title
  if ('notes' in body) updates.notes = body.notes
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('availability_poll')
    .update(updates)
    .eq('id', params.id)
    .eq('team_id', teamId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
