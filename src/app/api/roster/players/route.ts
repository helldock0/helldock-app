import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type CreatePayload = {
  team_id: string
  display_name: string
  riot_name: string
  riot_tag: string
  main_role?: string | null
  main_agent?: string | null
  roster_status?: 'main' | 'sub' | 'trial'
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as CreatePayload
  const { team_id, display_name, riot_name, riot_tag } = body
  if (!team_id || !display_name || !riot_name || !riot_tag) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: player, error: pErr } = await supabase
    .from('players')
    .insert({
      team_id,
      display_name,
      riot_name,
      riot_tag,
      main_role: body.main_role ?? null,
      main_agent: body.main_agent ?? null,
      roster_status: body.roster_status ?? 'main',
    })
    .select('id')
    .single()
  if (pErr || !player) {
    return NextResponse.json({ error: pErr?.message ?? 'Create failed' }, { status: 400 })
  }

  const { error: aErr } = await supabase.from('player_accounts').insert({
    player_id: player.id,
    riot_name,
    riot_tag,
    is_primary: true,
    label: 'main',
  })
  if (aErr) {
    return NextResponse.json(
      { error: `Player created but primary account failed: ${aErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ id: player.id })
}
