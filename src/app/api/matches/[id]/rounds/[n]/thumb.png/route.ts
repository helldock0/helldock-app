// Per-round kill-heatmap PNG thumbnail.
//
// Reuses the same Resvg pipeline as the Discord recap, just scoped to a
// single round's kill events. Used by the match-detail Review tab to
// render thumbs next to each ReviewItem and (later) by the dashboard
// Review Queue card.
//
// Cache headers: long-cache because kill_events are immutable after import.
// Rehydrating a match rewrites them, which changes the response — callers
// invalidate by busting the URL (e.g. ?v=<imported_at>) if they need fresh.

import { createClient } from '@/lib/supabase/server'
import { renderMatchHeatmapPng, type HeatmapKillEvent } from '@/lib/discord-heatmap'
import { requireSelectedTeam } from '@/lib/team-session'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: { id: string; n: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const roundNum = Number(params.n)
  if (!Number.isFinite(roundNum) || roundNum < 1) {
    return new Response('Bad round number', { status: 400 })
  }

  const { teamId } = await requireSelectedTeam()

  // Match is identified by match_id_helldock in the route (e.g. M026), not
  // by UUID. We scope to the selected team so direct URL access from a
  // different team session 404s rather than leaking.
  const { data: match } = await supabase
    .from('matches')
    .select('id, map_name')
    .eq('match_id_helldock', params.id)
    .eq('team_id', teamId)
    .is('deleted_at', null)
    .single()

  if (!match) return new Response('Match not found', { status: 404 })
  if (!match.map_name) return new Response('No map', { status: 404 })

  const { data: events } = await supabase
    .from('kill_events')
    .select('killer_x, killer_y, victim_x, victim_y, killer_is_ours')
    .eq('match_id', match.id)
    .eq('round_num', roundNum)

  const killEvents: HeatmapKillEvent[] = (events ?? []) as HeatmapKillEvent[]
  if (killEvents.length === 0) {
    // No events for this round — return an empty 1x1 PNG so the <img>
    // doesn't show a broken icon. Browsers cache this fine.
    return pngResponse(emptyPngBuffer(), 'public, max-age=300')
  }

  const png = await renderMatchHeatmapPng({
    mapName: match.map_name,
    killEvents,
    // Always dots — densities don't make sense for ~5 events per round.
    mode: 'dots',
  })

  if (!png) {
    return new Response('Render failed', { status: 500 })
  }

  // Kill events are immutable post-import; safe to cache aggressively.
  return pngResponse(png, 'public, max-age=86400, immutable')
}

function pngResponse(buf: Buffer, cacheControl: string): Response {
  // Blob wrapping side-steps the TS quirk where Uint8Array isn't typed as
  // BodyInit; behaviorally identical to passing the Buffer directly.
  const blob = new Blob([new Uint8Array(buf)], { type: 'image/png' })
  return new Response(blob, {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': cacheControl,
    },
  })
}

// Minimal valid 1x1 transparent PNG. Returned when a round has no kills so
// callers can render a placeholder without special-casing the missing case.
const EMPTY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function emptyPngBuffer(): Buffer {
  return Buffer.from(EMPTY_PNG_B64, 'base64')
}
