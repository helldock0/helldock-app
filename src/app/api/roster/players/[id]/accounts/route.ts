import { NextResponse } from 'next/server'
import { requireTeamScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

type AddAccountPayload = {
  riot_name: string
  riot_tag: string
  label?: string | null
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  // Verify the player belongs to this team
  const { data: player } = await scope.supabase
    .from('players')
    .select('id')
    .eq('id', params.id)
    .eq('team_id', scope.teamId)
    .single()
  if (!player) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json()) as AddAccountPayload
  const { riot_name, riot_tag } = body
  if (!riot_name || !riot_tag) {
    return NextResponse.json({ error: 'riot_name and riot_tag required' }, { status: 400 })
  }

  const { data: existing } = await scope.supabase
    .from('player_accounts')
    .select('id, player_id')
    .eq('riot_name', riot_name)
    .eq('riot_tag', riot_tag)
    .maybeSingle()

  if (existing && existing.player_id !== params.id) {
    // Don't leak the other player's display_name — could be on another team
    return NextResponse.json(
      { error: 'Already linked to another player' },
      { status: 409 }
    )
  }

  if (existing) {
    return NextResponse.json({ id: existing.id, already: true })
  }

  const { data: created, error } = await scope.supabase
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

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'insert',
    table: 'player_accounts',
    rowId: created.id,
    changes: { player_id: params.id, riot_name, riot_tag },
  })

  return NextResponse.json({ id: created.id })
}
