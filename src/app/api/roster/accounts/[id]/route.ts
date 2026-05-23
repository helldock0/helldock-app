import { NextResponse } from 'next/server'
import { requireTeamWriteScope, stripFields, type TeamScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

const FORBIDDEN_FIELDS = ['id', 'player_id', 'created_at', 'is_primary', 'riot_name', 'riot_tag'] as const

type UpdatePayload = Partial<{
  label: string | null
}>

async function verifyAccountOwnership(
  scope: TeamScope,
  accountId: string
): Promise<{ id: string; player_id: string; is_primary: boolean } | null> {
  const { data: account } = await scope.supabase
    .from('player_accounts')
    .select('id, player_id, is_primary')
    .eq('id', accountId)
    .single()
  if (!account) return null

  const { data: player } = await scope.supabase
    .from('players')
    .select('id')
    .eq('id', account.player_id)
    .eq('team_id', scope.teamId)
    .single()
  if (!player) return null

  return account
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const account = await verifyAccountOwnership(scope, params.id)
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = (await req.json()) as UpdatePayload & Record<string, unknown>
  const updates = stripFields(body, FORBIDDEN_FIELDS)

  const { error } = await scope.supabase
    .from('player_accounts')
    .update(updates)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'player_accounts',
    rowId: params.id,
    changes: updates,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const account = await verifyAccountOwnership(scope, params.id)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (account.is_primary) {
    return NextResponse.json({ error: 'Cannot delete primary account' }, { status: 400 })
  }

  const { error } = await scope.supabase.from('player_accounts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'delete',
    table: 'player_accounts',
    rowId: params.id,
  })

  return NextResponse.json({ ok: true })
}
