import { fetchMmr } from '@/lib/henrik/client'
import { requireTeamScope } from '@/lib/route-guard'
import { NextResponse } from 'next/server'

const API_KEY = process.env.HENRIK_API_KEY ?? process.env.HENRIKDEV_API_KEY ?? ''
const CONCURRENCY = 5

type RefreshRequest = {
  riotIds: string[]
  region: string
}

type RefreshError = { riot_id: string; error: string }

// NOTE: player_mmr_cache is a shared cache keyed by puuid — same puuid maps to
// the same MMR regardless of which team queries it. We require a team scope to
// prevent unauth abuse of the Henrik rate quota, but don't restrict which
// riot_ids can be refreshed.
export async function POST(req: Request) {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const body: RefreshRequest = await req.json()
  const riotIds = Array.from(new Set((body.riotIds ?? []).filter(Boolean)))
  const region = body.region

  if (!riotIds.length) return NextResponse.json({ refreshed: 0, skipped: 0, errors: [] })
  if (!region) return NextResponse.json({ error: 'region required' }, { status: 400 })

  let refreshed = 0
  let skipped = 0
  const errors: RefreshError[] = []

  // Sequential batches of CONCURRENCY to stay under Henrik's rate cap
  for (let i = 0; i < riotIds.length; i += CONCURRENCY) {
    const batch = riotIds.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (riotId) => {
        const [name, tag] = riotId.split('#')
        if (!name || !tag) {
          return { riotId, skipped: true, error: 'malformed riot_id' as const }
        }

        const data = await fetchMmr(name, tag, region, API_KEY)
        if (!data || data?.errors) {
          return { riotId, error: JSON.stringify(data?.errors ?? data) }
        }

        // Henrik V3 MMR: { account:{puuid,...}, current: { tier:{id,name}, rr, elo, leaderboard_placement },
        //                   peak: { tier:{id,name}, season:{id,short} } }
        const puuid: string | null = data.account?.puuid ?? data.puuid ?? null
        if (!puuid) return { riotId, error: 'no puuid in response' }

        const current = data.current ?? {}
        const peak = data.peak ?? {}

        const row = {
          puuid,
          riot_id: riotId,
          region,
          current_tier_name: current.tier?.name ?? null,
          current_rr: typeof current.rr === 'number' ? current.rr : null,
          current_elo: typeof current.elo === 'number' ? current.elo : null,
          current_leaderboard_placement:
            typeof current.leaderboard_placement === 'number' ? current.leaderboard_placement : null,
          peak_tier_name: peak.tier?.name ?? null,
          peak_season_id: peak.season?.id ?? peak.season?.short ?? null,
          fetched_at: new Date().toISOString(),
        }

        const { error: upsertErr } = await scope.supabase
          .from('player_mmr_cache')
          .upsert(row, { onConflict: 'puuid' })

        if (upsertErr) return { riotId, error: upsertErr.message }
        return { riotId, ok: true as const }
      })
    )

    for (const r of results) {
      if ('ok' in r && r.ok) refreshed++
      else if ('skipped' in r && r.skipped) {
        skipped++
        errors.push({ riot_id: r.riotId, error: r.error })
      } else if ('error' in r && r.error) {
        errors.push({ riot_id: r.riotId, error: r.error })
      }
    }
  }

  return NextResponse.json({ refreshed, skipped, errors })
}
