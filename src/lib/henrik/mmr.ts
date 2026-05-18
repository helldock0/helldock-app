import { createClient } from '@/lib/supabase/server'

export type MmrCacheRow = {
  puuid: string
  riot_id: string
  region: string
  current_tier_name: string | null
  current_rr: number | null
  current_elo: number | null
  current_leaderboard_placement: number | null
  peak_tier_name: string | null
  peak_season_id: string | null
  fetched_at: string
}

export type MmrLookup = {
  cached: MmrCacheRow | null
  stale: boolean
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export async function getMmrForRiotId(riotId: string): Promise<MmrLookup> {
  const supabase = createClient()
  const { data } = await supabase
    .from('player_mmr_cache')
    .select('*')
    .eq('riot_id', riotId)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { cached: null, stale: true }

  const fetchedAt = new Date(data.fetched_at).getTime()
  const stale = Date.now() - fetchedAt > TWENTY_FOUR_HOURS_MS
  return { cached: data as MmrCacheRow, stale }
}

export async function getMmrForRiotIds(riotIds: string[]): Promise<Record<string, MmrLookup>> {
  if (!riotIds.length) return {}
  const supabase = createClient()
  const { data } = await supabase
    .from('player_mmr_cache')
    .select('*')
    .in('riot_id', riotIds)

  const out: Record<string, MmrLookup> = {}
  const rows = (data ?? []) as MmrCacheRow[]
  for (const row of rows) {
    const fetchedAt = new Date(row.fetched_at).getTime()
    const stale = Date.now() - fetchedAt > TWENTY_FOUR_HOURS_MS
    const existing = out[row.riot_id]
    if (!existing || new Date(existing.cached!.fetched_at).getTime() < fetchedAt) {
      out[row.riot_id] = { cached: row, stale }
    }
  }
  for (const id of riotIds) {
    if (!out[id]) out[id] = { cached: null, stale: true }
  }
  return out
}
