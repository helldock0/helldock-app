import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/polls/[token]/respond — public, no auth.
// Body: { respondent_name: string, slot_ats: string[] (ISO) }
// Replaces all prior rows for (poll, respondent_name).
export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const supabase = createClient()
  const body = await req.json()
  const name = String(body?.respondent_name ?? '').trim()
  if (!name) {
    return NextResponse.json({ error: 'respondent_name required' }, { status: 400 })
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'name too long' }, { status: 400 })
  }
  const slotAts = Array.isArray(body?.slot_ats) ? body.slot_ats : []

  const { data: poll, error: pollErr } = await supabase
    .from('availability_poll')
    .select('id, start_at, end_at, slot_minutes')
    .eq('token', params.token)
    .single()
  if (pollErr || !poll) {
    return NextResponse.json({ error: 'poll not found' }, { status: 404 })
  }

  // Validate slot_ats fall inside the poll window AND align to a slot boundary.
  const startMs = new Date(poll.start_at).getTime()
  const endMs = new Date(poll.end_at).getTime()
  const stepMs = poll.slot_minutes * 60_000
  const validSlots: string[] = []
  for (const raw of slotAts) {
    if (typeof raw !== 'string') continue
    const t = new Date(raw).getTime()
    if (isNaN(t)) continue
    if (t < startMs || t >= endMs) continue
    if ((t - startMs) % stepMs !== 0) continue
    validSlots.push(new Date(t).toISOString())
  }

  // Idempotent replace: delete this respondent's prior rows, then insert.
  const { error: delErr } = await supabase
    .from('availability_response')
    .delete()
    .eq('poll_id', poll.id)
    .eq('respondent_name', name)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  if (validSlots.length === 0) {
    return NextResponse.json({ ok: true, count: 0 })
  }

  const rows = validSlots.map((slot_at) => ({
    poll_id: poll.id,
    respondent_name: name,
    slot_at,
  }))
  const { error: insErr } = await supabase
    .from('availability_response')
    .insert(rows)
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length })
}
