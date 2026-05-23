import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** Revoke = set revoked_at; row remains for audit. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const { error } = await scope.supabase
    .from('capture_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('team_id', scope.teamId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'capture_tokens',
    rowId: params.id,
    changes: { revoked_at: 'now()' },
  })

  return NextResponse.json({ ok: true })
}
