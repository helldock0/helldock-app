import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'
import { notifyDiscordForMatch, baseUrlFromRequest } from '@/lib/discord'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const { data: match, error } = await scope.supabase
    .from('matches')
    .select('id, match_id_helldock')
    .eq('id', params.id)
    .eq('team_id', scope.teamId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!match) return NextResponse.json({ error: 'match not found' }, { status: 404 })

  await notifyDiscordForMatch(scope.supabase, scope.teamId, match.id, baseUrlFromRequest(req))

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'matches',
    rowId: match.id,
    changes: { match_id_helldock: match.match_id_helldock },
  })

  return NextResponse.json({ ok: true, match_id_helldock: match.match_id_helldock })
}
