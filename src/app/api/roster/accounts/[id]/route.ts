import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type UpdatePayload = Partial<{
  label: string | null
}>

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as UpdatePayload
  const { error } = await supabase
    .from('player_accounts')
    .update(body)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row } = await supabase
    .from('player_accounts')
    .select('id, is_primary')
    .eq('id', params.id)
    .single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.is_primary) {
    return NextResponse.json({ error: 'Cannot delete primary account' }, { status: 400 })
  }

  const { error } = await supabase.from('player_accounts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
