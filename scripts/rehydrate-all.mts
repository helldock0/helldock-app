/**
 * One-off orchestrator: fetches Henrik V4 + MMR data and writes JSON outputs that
 * the calling agent then applies to Postgres via Supabase MCP. Bypasses the auth-
 * gated API routes entirely (no session needed).
 *
 * Usage:
 *   npx tsx scripts/rehydrate-all.mts rehydrate <path-to-matches.json>
 *   npx tsx scripts/rehydrate-all.mts mmr       <path-to-mmr.json>
 *
 * Inputs:
 *   rehydrate: [{ id, henrik_id, team_slug, match_id_helldock }, ...]
 *   mmr:       { riotIds: string[], region: string }
 *
 * Outputs are written to scripts/_out/<mode>.json
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { fetchMatchByIdV4, fetchMmr, isPremierMatch } from '../src/lib/henrik/client'
import { transformMatchToRows } from '../src/lib/henrik/transformers'
import { TEAM_CONFIGS } from '../src/lib/teams'
import { readFileSync } from 'node:fs'

const API_KEY = process.env.HENRIK_API_KEY ?? ''
if (!API_KEY) {
  console.error('HENRIK_API_KEY env var required')
  process.exit(1)
}

type MatchInput = {
  id: string
  henrik_id: string
  team_slug: string
  match_id_helldock: string
}

async function rehydrateAll(matches: MatchInput[]) {
  const out = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    process.stderr.write(`[${i + 1}/${matches.length}] ${m.match_id_helldock} (${m.team_slug})... `)
    if (i > 0) await new Promise((r) => setTimeout(r, 1500)) // throttle: stay under Henrik free/auth ~90req/min
    const cfg = TEAM_CONFIGS[m.team_slug]
    if (!cfg) {
      process.stderr.write('SKIP (no team config)\n')
      out.push({ id: m.id, match_id_helldock: m.match_id_helldock, status: 'error', error: `no team config for ${m.team_slug}` })
      continue
    }
    const raw = await fetchMatchByIdV4(m.henrik_id, cfg.mainAccount.region, API_KEY)
    if (!raw || raw?.errors) {
      process.stderr.write(`HENRIK ERR\n`)
      out.push({ id: m.id, match_id_helldock: m.match_id_helldock, status: 'error', error: JSON.stringify(raw?.errors ?? raw).slice(0, 200) })
      continue
    }
    const mainRiotId = `${cfg.mainAccount.name}#${cfg.mainAccount.tag}`
    const xf = transformMatchToRows(raw, mainRiotId, cfg.roster, isPremierMatch(raw))
    if ('error' in xf) {
      process.stderr.write(`XF ERR: ${xf.error}\n`)
      out.push({ id: m.id, match_id_helldock: m.match_id_helldock, status: 'error', error: xf.error })
      continue
    }
    process.stderr.write(`OK (${xf.rounds.length} rds, ${xf.ourPlayers.length} ours, ${xf.oppPlayers.length} opps, ${xf.killEvents.length} kills)\n`)
    out.push({
      id: m.id,
      match_id_helldock: m.match_id_helldock,
      team_slug: m.team_slug,
      status: 'ok',
      rounds: xf.rounds,
      ourPlayers: xf.ourPlayers,
      oppPlayers: xf.oppPlayers,
      killEvents: xf.killEvents,
    })
  }
  return out
}

async function refreshMmr(riotIds: string[], region: string) {
  const out = []
  for (let i = 0; i < riotIds.length; i++) {
    const id = riotIds[i]
    const [name, tag] = id.split('#')
    process.stderr.write(`[${i + 1}/${riotIds.length}] ${id}... `)
    if (i > 0) await new Promise((r) => setTimeout(r, 1500)) // throttle
    if (!name || !tag) {
      process.stderr.write('SKIP (malformed)\n')
      out.push({ riot_id: id, status: 'error', error: 'malformed riot_id' })
      continue
    }
    const data = await fetchMmr(name, tag, region, API_KEY)
    if (!data || data?.errors) {
      process.stderr.write(`HENRIK ERR\n`)
      out.push({ riot_id: id, status: 'error', error: JSON.stringify(data?.errors ?? data).slice(0, 200) })
      continue
    }
    // V3 MMR shape: { account: { puuid }, current: {...}, peak: {...}, seasonal: [...] }
    const puuid = data.account?.puuid ?? data.puuid ?? null
    if (!puuid) {
      process.stderr.write('NO PUUID\n')
      out.push({ riot_id: id, status: 'error', error: 'no puuid in response' })
      continue
    }
    const current = data.current ?? {}
    const peak = data.peak ?? {}
    const row = {
      riot_id: id,
      status: 'ok',
      puuid,
      region,
      current_tier_name: current.tier?.name ?? null,
      current_rr: typeof current.rr === 'number' ? current.rr : null,
      current_elo: typeof current.elo === 'number' ? current.elo : null,
      current_leaderboard_placement:
        typeof current.leaderboard_placement === 'number' ? current.leaderboard_placement : null,
      peak_tier_name: peak.tier?.name ?? null,
      peak_season_id: peak.season?.id ?? peak.season?.short ?? null,
    }
    process.stderr.write(`OK (${row.current_tier_name ?? '—'} · ${row.current_rr ?? '—'})\n`)
    out.push(row)
  }
  return out
}

async function main() {
  const mode = process.argv[2]
  const inputPath = process.argv[3]
  if (!mode || !inputPath) {
    console.error('Usage: tsx rehydrate-all.mts <rehydrate|mmr> <input-json-path>')
    process.exit(1)
  }
  const payload = JSON.parse(readFileSync(inputPath, 'utf8'))

  mkdirSync('scripts/_out', { recursive: true })
  const outPath = `scripts/_out/${mode}.json`

  if (mode === 'rehydrate') {
    const result = await rehydrateAll(payload as MatchInput[])
    writeFileSync(outPath, JSON.stringify(result))
    process.stderr.write(`\nWrote ${result.length} match results → ${outPath}\n`)
  } else if (mode === 'mmr') {
    const result = await refreshMmr(payload.riotIds, payload.region)
    writeFileSync(outPath, JSON.stringify(result))
    process.stderr.write(`\nWrote ${result.length} MMR results → ${outPath}\n`)
  } else {
    console.error(`Unknown mode: ${mode}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
