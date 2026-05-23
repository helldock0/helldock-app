import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import { generateToken } from '@/lib/captures/token'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('capture_tokens')
    .select(`
      id, label, created_at, last_used_at, revoked_at,
      players!inner(id, display_name)
    `)
    .eq('team_id', teamId)
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
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { label?: unknown; playerId?: unknown } | null
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  const playerId = typeof body?.playerId === 'string' ? body.playerId : ''

  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 })
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 })

  // Verify player belongs to selected team
  const { data: player } = await supabase
    .from('players')
    .select('id, display_name, team_id')
    .eq('id', playerId)
    .single()
  if (!player || player.team_id !== teamId) {
    return NextResponse.json({ error: 'player not in selected team' }, { status: 400 })
  }

  const { plaintext, hash } = generateToken()
  const { data: inserted, error } = await supabase
    .from('capture_tokens')
    .insert({
      token_hash: hash,
      label,
      player_id: playerId,
      team_id: teamId,
      created_by_user_id: user.id,
    })
    .select('id, label, created_at')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  // Plaintext returned ONCE — UI shows it in a copy-able box and never asks again.
  return NextResponse.json({
    id: inserted.id,
    label: inserted.label,
    created_at: inserted.created_at,
    player_name: player.display_name,
    plaintext,
  })
}
