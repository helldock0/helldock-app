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

  const deprecated = process.env.CAPTURE_TRAY_DEPRECATED === 'true'
  const overwolfUrl = process.env.OVERWOLF_APP_URL ?? null

  return NextResponse.json({
    ok: true,
    label: auth.label,
    team: auth.teamName,
    player: auth.playerName,
    ...(deprecated && { deprecated: true, ...(overwolfUrl && { overwolf_url: overwolfUrl }) }),
  })
}
