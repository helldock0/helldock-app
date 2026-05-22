/**
 * Generate scout-memo narratives for all (or a subset of) VCT CN teams.
 * Stores results in pro_scout_narratives table — the deployed page reads
 * from this cache, so no LLM call is needed in production.
 *
 * Usage:
 *   GOOGLE_AI_API_KEY=...
 *     npx tsx scripts/gen-narratives.mts               # all teams with ≥3 matches
 *     npx tsx scripts/gen-narratives.mts --team <uuid>
 *     npx tsx scripts/gen-narratives.mts --vlr 1119
 *     npx tsx scripts/gen-narratives.mts --force       # ignore 24h cache TTL
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { computeTeamDossier } from '../src/lib/pro-scout/dossier'
import { generateAndCacheNarrative } from '../src/lib/pro-scout/narrative'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name: string) => process.argv.includes(name)

const RATE_LIMIT_MS = 4000 // be polite to Google AI free tier

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  if (!process.env.GOOGLE_AI_API_KEY) {
    console.error('GOOGLE_AI_API_KEY env var required')
    process.exit(1)
  }

  const sb = createAdminClient()

  let teamIds: string[] = []
  const single = arg('--team')
  const vlrId = arg('--vlr')
  if (single) {
    teamIds = [single]
  } else if (vlrId) {
    const { data } = await sb
      .from('pro_teams')
      .select('id')
      .eq('vlr_team_id', Number(vlrId))
      .single()
    if (data?.id) teamIds = [data.id]
  } else {
    // All teams with ≥3 matches
    const { data: teams } = await sb.from('pro_teams').select('id, name')
    if (!teams) {
      console.error('No teams found')
      process.exit(1)
    }
    for (const t of teams) {
      const { count } = await sb
        .from('pro_matches')
        .select('id', { count: 'exact', head: true })
        .or(`team_a_id.eq.${t.id},team_b_id.eq.${t.id}`)
      if ((count ?? 0) >= 3) teamIds.push(t.id)
    }
  }

  console.error(`Generating narratives for ${teamIds.length} team(s)...`)

  let ok = 0
  let fail = 0
  let i = 0
  for (const teamId of teamIds) {
    i++
    if (i > 1) await sleep(RATE_LIMIT_MS)

    const dossier = await computeTeamDossier(sb, teamId)
    if (!dossier) {
      console.error(`  [${i}/${teamIds.length}] ${teamId}: dossier null`)
      fail++
      continue
    }

    if (has('--force')) {
      // Wipe existing cache for this team+scope so generateAndCache regenerates
      await sb
        .from('pro_scout_narratives')
        .delete()
        .eq('team_id', teamId)
        .eq('scope_label', dossier.scope.label)
    }

    const t0 = Date.now()
    const result = await generateAndCacheNarrative(sb, dossier)
    const elapsed = Date.now() - t0

    if (result) {
      ok++
      console.error(
        `  [${i}/${teamIds.length}] ${dossier.team.name.slice(0, 30).padEnd(30)} ` +
          `${result.fromCache ? '(cached)' : `(gen ${elapsed}ms)`} ${result.content.length}ch`
      )
    } else {
      fail++
      console.error(`  [${i}/${teamIds.length}] ${dossier.team.name}: generation failed`)
    }
  }

  console.error(`\nDone: ${ok} ok, ${fail} fail`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
