import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateToken } from '@/lib/captures/token'

export const dynamic = 'force-dynamic'

/**
 * Cheap token validator used by the tray agent's "Send test ping" button.
 * No DB writes beyond the implicit `last_used_at` bump in authenticateToken.
 */
export async function GET(req: Request) {
  const supabase = createAdminClient()
  const auth = await authenticateToken(supabase, req.headers.get('authorization'))
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'invalid or revoked token' }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    label: auth.label,
    team: auth.teamName,
    player: auth.playerName,
  })
}
