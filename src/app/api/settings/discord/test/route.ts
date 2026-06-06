import { NextResponse } from 'next/server'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { postMatchToDiscord, baseUrlFromRequest } from '@/lib/discord'

export async function POST(req: Request) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const { data: teamRow } = await scope.supabase
    .from('teams')
    .select('discord_webhook_url, name')
    .eq('id', scope.teamId)
    .single()

  if (!teamRow?.discord_webhook_url) {
    return NextResponse.json(
      { error: 'No webhook URL set. Save one first.' },
      { status: 400 }
    )
  }

  const result = await postMatchToDiscord(teamRow.discord_webhook_url, {
    matchIdHelldock: 'TEST',
    matchUrl: `${baseUrlFromRequest(req).replace(/\/+$/, '')}/settings`,
    mapName: 'Lotus',
    teamName: teamRow.name ?? scope.teamSlug,
    opponentName: 'Webhook Test',
    ourScore: 13,
    oppScore: 11,
    result: 'W',
    tactical: {
      halves: { h1: { w: 6, l: 6 }, h2: { w: 7, l: 5 } },
      pistol: { w: 0, l: 2 },
      att: { w: 4, l: 8, plantRatePct: 42, avgPlantSec: 31 },
      def: { w: 9, l: 3, defuseRatePct: 50, avgDefuseSec: 37 },
      byBuyType: [
        { type: 'Pistol', w: 0, l: 2 },
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
      ults: null,
    },
    highlights: [
      { kind: 'four_k', player: 'MAK', count: 1 },
      { kind: 'clutch', player: 'Trippie', clutchType: '1v3', round: 17 },
      { kind: 'three_k', player: 'Spike', count: 2 },
    ],
    streak: { kind: 'W', length: 3, extended: true },
    mapHistory: {
      mapName: 'Lotus',
      wins: 2,
      total: 7,
      windowLabel: 'last 7 plays',
    },
    playerDeltas: [
      { name: 'MAK', k: 24, a: 5, d: 14, acs: 287, acsDelta: 34 },
      { name: 'Trippie', k: 19, a: 7, d: 12, acs: 251, acsDelta: -8 },
      { name: 'Spike', k: 17, a: 8, d: 15, acs: 234, acsDelta: 12 },
      { name: 'Cypher', k: 14, a: 9, d: 16, acs: 198, acsDelta: -5 },
      { name: 'Reyna', k: 11, a: 6, d: 17, acs: 152, acsDelta: -41 },
    ],
    oppScoreboard: [
      { name: 'Player1', k: 18, a: 3, d: 14, acs: 240 },
      { name: 'Player2', k: 16, a: 5, d: 15, acs: 220 },
      { name: 'Player3', k: 14, a: 8, d: 12, acs: 205 },
      { name: 'Player4', k: 12, a: 4, d: 16, acs: 178 },
      { name: 'Player5', k: 9, a: 7, d: 17, acs: 145 },
    ],
    reviewItems: [
      {
        roundNum: 7,
        score: 0.71,
        outcome: 'L',
        side: 'Attack',
        roundType: 'Full Buy',
        scoreAtStart: { ours: 4, theirs: 3 },
        reasons: [
          {
            kind: 'wp_surprise',
            text: 'WP model said 78% — expected win, lost',
            weight: 0.21,
          },
          { kind: 'leverage', text: 'High-leverage round (WP swing 38pp)', weight: 0.19 },
        ],
        coachGrade: 2,
        coachTags: ['bad_rotate'],
        hasClutch: false,
        clutchType: null,
        clutchPlayer: null,
        wpPredicted: 78,
        wpSurprise: 0.78,
        wpa: 0.38,
      },
      {
        roundNum: 17,
        score: 0.58,
        outcome: 'W',
        side: 'Defense',
        roundType: 'Eco',
        scoreAtStart: { ours: 7, theirs: 9 },
        reasons: [
          { kind: 'clutch', text: 'Trippie 1v3 clutch', weight: 0.15 },
          { kind: 'streak_break', text: 'Broke a streak (≥3)', weight: 0.1 },
        ],
        coachGrade: null,
        coachTags: [],
        hasClutch: true,
        clutchType: '1v3',
        clutchPlayer: 'Trippie',
        wpPredicted: 28,
        wpSurprise: 0.72,
        wpa: 0.25,
      },
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
