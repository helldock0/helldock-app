/**
 * One-shot backfill for round_player_stats.
 *
 * Iterates every non-deleted match with a henrik_id and re-runs the rehydrate
 * helper, which now also wipes + repopulates the new round_player_stats table.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   HENRIK_API_KEY=...
 *     npx tsx scripts/backfill-rps.mts
 *
 * Throttled to 1.5s/match to stay under the Henrik free-tier cap (~90 req/min).
 */
import { createAdminClient } from '../src/lib/supabase/admin'
import { rehydrateMatch } from '../src/lib/henrik/rehydrate'

const RATE_LIMIT_MS = 1500

if (!process.env.HENRIK_API_KEY && !process.env.HENRIKDEV_API_KEY) {
  console.error('HENRIK_API_KEY (or HENRIKDEV_API_KEY) env var required')
  process.exit(1)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const supabase = createAdminClient()

  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, match_id_helldock, henrik_id')
    .not('henrik_id', 'is', null)
    .is('deleted_at', null)
    .order('match_date', { ascending: true })

  if (error) {
    console.error('matches list error:', error.message)
    process.exit(1)
  }
  if (!matches || matches.length === 0) {
    console.error('No matches to backfill.')
    return
  }

  let ok = 0
  let fail = 0
  let totalRpsInserted = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    process.stderr.write(
      `[${i + 1}/${matches.length}] ${m.match_id_helldock}... `
    )
    const result = await rehydrateMatch(supabase, m.id)
    if (result.ok) {
      ok++
      totalRpsInserted += result.round_player_stats_inserted
      process.stderr.write(
        `OK (${result.rounds_patched} rds, ${result.kill_events_inserted} kills, ${result.round_player_stats_inserted} rps)\n`
      )
    } else {
      fail++
      process.stderr.write(`ERR [${result.status}] ${result.error}\n`)
    }
    if (i < matches.length - 1) await sleep(RATE_LIMIT_MS)
  }

  process.stderr.write(
    `\nDone: ${ok} ok, ${fail} fail. ${totalRpsInserted} round_player_stats rows inserted.\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
