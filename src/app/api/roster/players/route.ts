import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

type CreatePayload = {
  team_id?: string
  display_name: string
  riot_name: string
  riot_tag: string
  main_role?: string | null
  main_agent?: string | null
  roster_status?: 'main' | 'sub' | 'trial'
}

export async function POST(req: Request) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const body = (await req.json()) as CreatePayload
  const { display_name, riot_name, riot_tag } = body
  if (!display_name || !riot_name || !riot_tag) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If the client passed a team_id, it must match the session's selected team
  if (body.team_id && body.team_id !== scope.teamId) {
    return NextResponse.json({ error: 'team_id mismatch' }, { status: 400 })
  }

  const { data: player, error: pErr } = await scope.supabase
    .from('players')
    .insert({
      team_id: scope.teamId,
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

  const { error: aErr } = await scope.supabase.from('player_accounts').insert({
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

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'insert',
    table: 'players',
    rowId: player.id,
    changes: { display_name, riot_name, riot_tag },
  })

  return NextResponse.json({ id: player.id })
}
