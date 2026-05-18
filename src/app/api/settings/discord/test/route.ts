import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import { postMatchToDiscord, baseUrlFromRequest } from '@/lib/discord'

export async function POST(req: Request) {
  const { teamId, teamName } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('discord_webhook_url')
    .eq('id', teamId)
    .single()

  if (!team?.discord_webhook_url) {
    return NextResponse.json(
      { error: 'No webhook URL set. Save one first.' },
      { status: 400 }
    )
  }

  const result = await postMatchToDiscord(team.discord_webhook_url, {
    matchIdHelldock: 'TEST',
    matchUrl: `${baseUrlFromRequest(req).replace(/\/+$/, '')}/settings`,
    mapName: 'Lotus',
    teamName,
    opponentName: 'Webhook Test',
    ourScore: 13,
    oppScore: 7,
    result: 'W',
    topFragger: { name: 'James', acs: 242, kills: 26, deaths: 15 },
    attWins: 8,
    attLosses: 4,
    defWins: 5,
    defLosses: 3,
    plantRatePct: 67,
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error ?? `Discord responded ${result.status ?? '???'}`,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ ok: true })
}
