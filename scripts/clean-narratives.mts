/**
 * Re-apply the latest stripPreamble logic to existing cached narratives.
 * Useful when the model emitted a reasoning trace that got cached alongside
 * the actual final memo — we strip back to just the structured memo.
 *
 * Usage:  npx tsx scripts/clean-narratives.mts
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { stripPreamble } from '../src/lib/pro-scout/narrative'

async function main() {
  const sb = createAdminClient()
  const { data, error } = await sb
    .from('pro_scout_narratives')
    .select('id, team_id, content_md')
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  if (!data || data.length === 0) {
    console.error('No narratives to clean.')
    return
  }

  let changed = 0
  let unchanged = 0
  for (const row of data) {
    const cleaned = stripPreamble(row.content_md)
    if (cleaned !== row.content_md) {
      const { error: updErr } = await sb
        .from('pro_scout_narratives')
        .update({ content_md: cleaned })
        .eq('id', row.id)
      if (updErr) {
        console.error(`${row.id} update error:`, updErr.message)
        continue
      }
      changed++
      console.error(`  cleaned ${row.id.slice(0, 8)}  (${row.content_md.length} → ${cleaned.length} chars)`)
    } else {
      unchanged++
    }
  }
  console.error(`\nDone: ${changed} cleaned, ${unchanged} already clean.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
