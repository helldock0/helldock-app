const BASE_URL = 'https://api.henrikdev.xyz'

export const DEFAULT_PLATFORM = 'pc'

/** V4 list — recent matches for a player, filtered by mode. */
export async function fetchMatchesV4(
  name: string,
  tag: string,
  region: string,
  mode: string,
  size = 10,
  apiKey = '',
  platform: string = DEFAULT_PLATFORM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const safeName = encodeURIComponent(name)
  const safeTag = encodeURIComponent(tag)
  const url = new URL(
    `${BASE_URL}/valorant/v4/matches/${region}/${platform}/${safeName}/${safeTag}`
  )
  url.searchParams.set('mode', mode)
  url.searchParams.set('size', String(size))

  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = apiKey

  try {
    const res = await fetch(url.toString(), { headers, cache: 'no-store' })
    if (!res.ok) {
      return { status: res.status, errors: [{ message: await res.text() }], data: [] }
    }
    return res.json()
  } catch (err) {
    return { status: 0, errors: [{ message: String(err) }], data: [] }
  }
}

/** V4 single-match by id — used by the rehydrate route.
 *  Note: V4 single-match path is `/v4/match/{region}/{matchid}` — NO platform segment
 *  (unlike the V4 list endpoint which does include platform). */
export async function fetchMatchByIdV4(
  matchId: string,
  region: string,
  apiKey = ''
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const url = `${BASE_URL}/valorant/v4/match/${region}/${encodeURIComponent(matchId)}`
  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = apiKey

  try {
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) {
      return { status: res.status, errors: [{ message: await res.text() }], data: null }
    }
    const body = await res.json()
    return body?.data ?? body
  } catch (err) {
    return { status: 0, errors: [{ message: String(err) }], data: null }
  }
}

/** Henrik MMR endpoint (v3). Returns current tier + RR + peak. */
export async function fetchMmr(
  name: string,
  tag: string,
  region: string,
  apiKey = '',
  platform: string = DEFAULT_PLATFORM
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const safeName = encodeURIComponent(name)
  const safeTag = encodeURIComponent(tag)
  const url = `${BASE_URL}/valorant/v3/mmr/${region}/${platform}/${safeName}/${safeTag}`

  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = apiKey

  try {
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) {
      return { status: res.status, errors: [{ message: await res.text() }], data: null }
    }
    const body = await res.json()
    return body?.data ?? body
  } catch (err) {
    return { status: 0, errors: [{ message: String(err) }], data: null }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPremierMatch(match: any): boolean {
  // V4 uses `metadata.queue.name` / `metadata.queue.id`; V3 used flat strings.
  // Handle both for safety.
  const meta = match?.metadata ?? {}
  const flatCandidates = ['queue', 'match_type', 'mode']
  for (const k of flatCandidates) {
    const v = meta[k]
    if (typeof v === 'string' && v.toLowerCase().includes('premier')) return true
    if (v && typeof v === 'object' && typeof v.name === 'string' && v.name.toLowerCase().includes('premier')) return true
    if (v && typeof v === 'object' && typeof v.id === 'string' && v.id.toLowerCase().includes('premier')) return true
  }
  return false
}
