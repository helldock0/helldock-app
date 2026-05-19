import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

export const dynamic = 'force-dynamic'

/** Revoke = set revoked_at; row remains for audit. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('capture_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('team_id', teamId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
