import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import { generatePollToken } from '@/lib/availability-poll'

// POST /api/polls — coach creates a new availability poll
export async function POST(req: Request) {
  const { teamId } = await requireSelectedTeam()
  const body = await req.json()

  if (!body?.start_at || !body?.end_at) {
    return NextResponse.json(
      { error: 'start_at and end_at are required' },
      { status: 400 }
    )
  }
  const slotMinutes = Number(body.slot_minutes ?? 30)
  if (![15, 30, 60].includes(slotMinutes)) {
    return NextResponse.json(
      { error: 'slot_minutes must be 15, 30, or 60' },
      { status: 400 }
    )
  }

  const start = new Date(body.start_at)
  const end = new Date(body.end_at)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json({ error: 'invalid dates' }, { status: 400 })
  }
  if (end <= start) {
    return NextResponse.json({ error: 'end_at must be after start_at' }, { status: 400 })
  }

  const supabase = createClient()
  const token = generatePollToken()

  const { data, error } = await supabase
    .from('availability_poll')
    .insert({
      team_id: teamId,
      token,
      title: body.title ?? null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      slot_minutes: slotMinutes,
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
