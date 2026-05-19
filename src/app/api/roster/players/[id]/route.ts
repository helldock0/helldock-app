import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type UpdatePayload = Partial<{
  display_name: string
  main_role: string | null
  main_agent: string | null
  roster_status: 'main' | 'sub' | 'trial'
  is_active: boolean
  riot_name: string
  riot_tag: string
}>

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as UpdatePayload

  const { riot_name, riot_tag, ...playerFields } = body

  if (Object.keys(playerFields).length > 0) {
    const { error } = await supabase
      .from('players')
      .update(playerFields)
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // If the primary riot_name/riot_tag changed, update both the players row (legacy column)
  // and the primary row in player_accounts so lookups stay consistent.
  if (riot_name !== undefined || riot_tag !== undefined) {
    const { data: primary } = await supabase
      .from('player_accounts')
      .select('id, riot_name, riot_tag')
      .eq('player_id', params.id)
      .eq('is_primary', true)
      .maybeSingle()

    const nextName = riot_name ?? primary?.riot_name
    const nextTag = riot_tag ?? primary?.riot_tag
    if (!nextName || !nextTag) {
      return NextResponse.json({ error: 'Primary account missing riot id' }, { status: 400 })
    }

    if (primary) {
      const { error } = await supabase
        .from('player_accounts')
        .update({ riot_name: nextName, riot_tag: nextTag })
        .eq('id', primary.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await supabase.from('player_accounts').insert({
        player_id: params.id,
        riot_name: nextName,
        riot_tag: nextTag,
        is_primary: true,
        label: 'main',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await supabase
      .from('players')
      .update({ riot_name: nextName, riot_tag: nextTag })
      .eq('id', params.id)
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Soft delete: keeps historical match_players rows intact.
  const { error } = await supabase
    .from('players')
    .update({ is_active: false })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
