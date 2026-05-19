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
    oppScore: 11,
    result: 'W',
    tactical: {
      halves: { h1: { w: 8, l: 4 }, h2: { w: 5, l: 7 } },
      pistol: { w: 1, l: 1 },
      att: { w: 7, l: 5, plantRatePct: 75, avgPlantSec: 27 },
      def: { w: 6, l: 6, defuseRatePct: 33, avgDefuseSec: 38 },
      byBuyType: [
        { type: 'Pistol', w: 1, l: 1 },
        { type: 'Eco', w: 1, l: 3 },
        { type: 'Anti-Eco', w: 2, l: 1 },
        { type: 'Bonus', w: 1, l: 1 },
        { type: 'Full Buy', w: 8, l: 5 },
      ],
      sites: {
        A: { wins: 4, total: 6 },
        B: { wins: 2, total: 3 },
        C: { wins: 1, total: 1 },
      },
      ults: { us: 18, them: 21 },
    },
    streak: { kind: 'W', length: 3, extended: true },
    mapHistory: {
      mapName: 'Lotus',
      wins: 5,
      total: 7,
      windowLabel: 'last 7 plays',
    },
    playerDeltas: [
      { name: 'MAK', acs: 287, acsDelta: 34 },
      { name: 'Trippie', acs: 251, acsDelta: -8 },
      { name: 'Spike', acs: 234, acsDelta: 12 },
      { name: 'Cypher', acs: 198, acsDelta: -5 },
      { name: 'Reyna', acs: 152, acsDelta: -41 },
    ],
    heatmapPng: null,
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
