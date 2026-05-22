/**
 * VLR.gg event scraper → pro_* tables.
 *
 * Usage:
 *   npx tsx scripts/scrape-vlr-event.mts                  # all configured events
 *   npx tsx scripts/scrape-vlr-event.mts --limit 1        # smoke test (1 match)
 *   npx tsx scripts/scrape-vlr-event.mts --event 2864     # specific event only
 *   npx tsx scripts/scrape-vlr-event.mts --event 2864 --limit 3
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Rate limit: ~1.5s/match. ~120 matches across all events = ~3 min total.
 */

import { vlrFetch, sleep } from '../src/lib/vlr/client'
import { parseEventMatchesPage, parseMatchPage } from '../src/lib/vlr/parsers'
import { ingestMatch, upsertEvent } from '../src/lib/vlr/ingest'
import { createAdminClient } from '../src/lib/supabase/admin'

type EventCfg = {
  vlrId: number
  name: string
  tier: 'VCT' | 'Evolution' | 'EWC-Qual' | 'Other'
  region: string
}

// Events to backfill — VCT CN focus. EWC + Evolution add context.
const EVENTS: EventCfg[] = [
  { vlrId: 2864, name: 'VCT 2026: China Stage 1', tier: 'VCT', region: 'CN' },
  { vlrId: 2956, name: 'EWC 2026: China Qualifier', tier: 'EWC-Qual', region: 'CN' },
  { vlrId: 2988, name: 'China Evolution Series 2026: Act 2', tier: 'Evolution', region: 'CN' },
]

const RATE_LIMIT_MS = 1500

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const limit = Number(arg('--limit') ?? Infinity)
const filterEventId = arg('--event') ? Number(arg('--event')) : null

async function scrapeEvent(cfg: EventCfg, sb: ReturnType<typeof createAdminClient>): Promise<void> {
  console.error(`\n══ ${cfg.vlrId} · ${cfg.name} ══`)

  const evRes = await vlrFetch(`/event/matches/${cfg.vlrId}/?series_id=all`)
  if (!evRes.ok) {
    console.error(`  event fetch failed: ${evRes.status}`)
    return
  }
  const { meta, matches } = parseEventMatchesPage(evRes.html, cfg.vlrId)
  meta.name = cfg.name || meta.name
  meta.region = cfg.region
  await upsertEvent(sb, meta, cfg.tier)

  const completed = matches.filter((m) => m.completed)
  console.error(`  ${completed.length} completed matches (of ${matches.length})`)

  let count = 0
  let ok = 0
  let fail = 0
  let mapsTotal = 0
  let playersTotal = 0
  let roundsTotal = 0

  for (const ms of completed) {
    if (count >= limit) break
    count++

    await sleep(RATE_LIMIT_MS)

    const mRes = await vlrFetch(ms.url)
    if (!mRes.ok) {
      console.error(
        `  [${count}/${completed.length}] ${ms.vlrMatchId} FETCH ${mRes.status}`
      )
      fail++
      continue
    }

    const match = parseMatchPage(mRes.html, ms.vlrMatchId)
    if (!match) {
      console.error(`  [${count}/${completed.length}] ${ms.vlrMatchId} PARSE null`)
      fail++
      continue
    }

    const result = await ingestMatch(sb, match)
    if (result.ok) {
      ok++
      mapsTotal += result.mapsInserted
      playersTotal += result.playersInserted
      roundsTotal += result.roundsInserted
      console.error(
        `  [${count}/${completed.length}] ${match.teamA.name} ${match.teamAScore}-${match.teamBScore} ${match.teamB.name} ` +
          `→ ${result.mapsInserted}m ${result.playersInserted}p ${result.roundsInserted}r`
      )
    } else {
      fail++
      console.error(
        `  [${count}/${completed.length}] ${ms.vlrMatchId} INGEST FAIL: ${result.error}`
      )
    }
  }

  console.error(
    `\n  Event done: ${ok} ok / ${fail} fail | totals: ${mapsTotal} maps, ${playersTotal} player-rows, ${roundsTotal} rounds`
  )
}

async function main() {
  const sb = createAdminClient()
  for (const e of EVENTS) {
    if (filterEventId && e.vlrId !== filterEventId) continue
    await scrapeEvent(e, sb)
  }
  console.error('\nAll events processed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
