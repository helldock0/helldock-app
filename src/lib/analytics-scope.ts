export type AnalyticsScopeMatch = {
  id: string
  match_date: string
  match_id_helldock?: string | null
  session_num?: number | null
  created_at?: string | null
  imported_at?: string | null
}

export type AnalyticsMatchScope<T extends AnalyticsScopeMatch> = {
  matches: T[]
  totalMatches: number
  lastGames: number | null
}

const MAX_LAST_GAMES = 100

export function parseLastGamesParam(value: string | string[] | null | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || raw === 'all') return null

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) return null

  return Math.min(parsed, MAX_LAST_GAMES)
}

export function compareAnalyticsMatchDesc(a: AnalyticsScopeMatch, b: AnalyticsScopeMatch): number {
  const byDate = b.match_date.localeCompare(a.match_date)
  if (byDate !== 0) return byDate

  const bySession = (b.session_num ?? -1) - (a.session_num ?? -1)
  if (bySession !== 0) return bySession

  const byCreated = (b.created_at ?? '').localeCompare(a.created_at ?? '')
  if (byCreated !== 0) return byCreated

  const byImported = (b.imported_at ?? '').localeCompare(a.imported_at ?? '')
  if (byImported !== 0) return byImported

  const byHelldockId = (b.match_id_helldock ?? '').localeCompare(a.match_id_helldock ?? '')
  if (byHelldockId !== 0) return byHelldockId

  return b.id.localeCompare(a.id)
}

export function resolveAnalyticsMatchScope<T extends AnalyticsScopeMatch>(
  matches: T[],
  lastGamesParam: string | string[] | null | undefined
): AnalyticsMatchScope<T> {
  const sorted = [...matches].sort(compareAnalyticsMatchDesc)
  const lastGames = parseLastGamesParam(lastGamesParam)

  return {
    matches: lastGames == null ? sorted : sorted.slice(0, lastGames),
    totalMatches: matches.length,
    lastGames,
  }
}

