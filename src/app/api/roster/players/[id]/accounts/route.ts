import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type AddAccountPayload = {
  riot_name: string
  riot_tag: string
  label?: string | null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as AddAccountPayload
  const { riot_name, riot_tag } = body
  if (!riot_name || !riot_tag) {
    return NextResponse.json({ error: 'riot_name and riot_tag required' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('player_accounts')
    .select('id, player_id, players(display_name)')
    .eq('riot_name', riot_name)
    .eq('riot_tag', riot_tag)
    .maybeSingle()

  if (existing && existing.player_id !== params.id) {
    const owner = (existing as { players?: { display_name?: string } | null }).players
      ?.display_name
    return NextResponse.json(
      { error: `Already linked to ${owner ?? 'another player'}` },
      { status: 409 }
    )
  }

  if (existing) {
    return NextResponse.json({ id: existing.id, already: true })
  }

  const { data: created, error } = await supabase
    .from('player_accounts')
    .insert({
      player_id: params.id,
      riot_name,
      riot_tag,
      is_primary: false,
      label: body.label ?? 'alt',
    })
    .select('id')
    .single()

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 400 })
  }
  return NextResponse.json({ id: created.id })
}
