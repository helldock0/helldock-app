import { NextResponse } from 'next/server'
import { requireTeamScope, requireTeamWriteScope } from '@/lib/route-guard'
import { generateToken } from '@/lib/captures/token'
import { logMutation } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const { data, error } = await scope.supabase
    .from('capture_tokens')
    .select(`
      id, label, created_at, last_used_at, revoked_at,
      players!inner(id, display_name)
    `)
    .eq('team_id', scope.teamId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r) => {
    const player = r.players as unknown as { id: string; display_name: string }
    return {
      id: r.id,
      label: r.label,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
      player_id: player.id,
      player_name: player.display_name,
    }
  })

  return NextResponse.json({ tokens: rows })
}

export async function POST(req: Request) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const body = (await req.json().catch(() => null)) as { label?: unknown; playerId?: unknown } | null
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''

  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 })
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  // Verify player belongs to selected team
  const { data: player } = await scope.supabase
    .from('players')
    .select('id, display_name, team_id')
    .eq('id', playerId)
    .single()
  if (!player || player.team_id !== scope.teamId) {
    return NextResponse.json({ error: 'player not in selected team' }, { status: 400 })
  }

  const { plaintext, hash } = generateToken()
  const { data: inserted, error } = await scope.supabase
    .from('capture_tokens')
    .insert({
      token_hash: hash,
      label,
      player_id: playerId,
      team_id: scope.teamId,
      created_by_user_id: scope.userId,
    })
    .select('id, label, created_at')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'insert',
    table: 'capture_tokens',
    rowId: inserted.id,
    changes: { label, player_id: playerId },
  })

  return NextResponse.json({
    id: inserted.id,
    label: inserted.label,
    created_at: inserted.created_at,
    player_name: player.display_name,
    plaintext,
  })
}
