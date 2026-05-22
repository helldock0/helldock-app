/**
 * VLR.gg HTTP client. Server-rendered HTML; we politely fetch and parse.
 *
 * Polite rate: a small delay between requests. We are not hammering VLR.
 */

export const VLR_BASE = 'https://www.vlr.gg'

const USER_AGENT =
  'helldock-pro-scout/0.1 (research; contact: jamesjoy696@gmail.com)'

export type FetchResult = {
  ok: boolean
  status: number
  html: string
  url: string
}

export async function vlrFetch(path: string): Promise<FetchResult> {
  const url = path.startsWith('http') ? path : `${VLR_BASE}${path}`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      cache: 'no-store',
    })
    const html = await res.text()
    return { ok: res.ok, status: res.status, html, url }
  } catch (err) {
    return { ok: false, status: 0, html: String(err), url }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Extract VLR team ID from /team/{id}/{slug} href. */
export function parseTeamHref(href: string | undefined | null): {
  id: number | null
  slug: string | null
} {
  if (!href) return { id: null, slug: null }
  const m = href.match(/\/team\/(\d+)\/([^/?#]+)/)
  if (!m) return { id: null, slug: null }
  return { id: Number(m[1]), slug: m[2] ?? null }
}

/** Extract VLR player ID from /player/{id}/{ign} href. */
export function parsePlayerHref(href: string | undefined | null): {
  id: number | null
  slug: string | null
} {
  if (!href) return { id: null, slug: null }
  const m = href.match(/\/player\/(\d+)\/([^/?#]+)/)
  if (!m) return { id: null, slug: null }
  return { id: Number(m[1]), slug: m[2] ?? null }
}

/** Extract VLR match ID from /{id}/{slug} href (root-level match URLs). */
export function parseMatchHref(href: string | undefined | null): {
  id: number | null
} {
  if (!href) return { id: null }
  // Match URLs are like /659476/all-gamers-vs-trace-esports-...
  const m = href.match(/^\/(\d+)\/[a-z0-9-]+/i)
  if (!m) return { id: null }
  return { id: Number(m[1]) }
}

/** Parse numeric stat from a VLR cell. Strips %, "+", commas. Returns null for "—" / empty. */
export function num(s: string | undefined | null): number | null {
  if (s == null) return null
  const t = String(s).trim().replace(/[%,]/g, '')
  if (!t || t === '—' || t === '-' || t.toLowerCase() === 'n/a') return null
  const n = Number(t.replace(/^\+/, ''))
  return Number.isFinite(n) ? n : null
}
