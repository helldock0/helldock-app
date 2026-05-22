/**
 * Probe the VLR parser against a locally-saved match HTML file.
 * No DB writes — just parses and prints the structured result.
 *
 * Usage:
 *   npx tsx scripts/probe-vlr.mts
 */

import { readFileSync } from 'node:fs'
import { parseMatchPage, parseEventMatchesPage } from '../src/lib/vlr/parsers'

const HTML_PATH = 'tmp/vlr/match-659476.html'
const VLR_MATCH_ID = 659476

const html = readFileSync(HTML_PATH, 'utf8')
const match = parseMatchPage(html, VLR_MATCH_ID)

if (!match) {
  console.error('parseMatchPage returned null')
  process.exit(1)
}

// Also probe event page
const eventHtml = readFileSync('tmp/vlr/event-2864-matches.html', 'utf8')
const { meta: evMeta, matches: evMatches } = parseEventMatchesPage(eventHtml, 2864)
console.log('═══ EVENT ═══')
console.log(`  ${evMeta.name}`)
console.log(`  ${evMeta.startDate} → ${evMeta.endDate}, prize: ${evMeta.prizePool}`)
console.log(`  matches found: ${evMatches.length}`)
console.log(`  first 5 matches:`)
for (const m of evMatches.slice(0, 5)) {
  console.log(`    ${m.vlrMatchId}  ${m.teamAName} vs ${m.teamBName}  [${m.stage ?? '—'}, completed=${m.completed}]`)
}
console.log()

// Summary view — what landed
console.log('═══ MATCH ═══')
console.log(`  ${match.teamA.name} ${match.teamAScore} - ${match.teamBScore} ${match.teamB.name}`)
console.log(`  ${match.eventName} · ${match.eventStage} · ${match.format} · ${match.matchDate}`)
console.log(`  winner: ${match.winnerSide} | teamA vlr_id=${match.teamA.vlrTeamId} | teamB vlr_id=${match.teamB.vlrTeamId}`)
console.log()

console.log('═══ MAPS ═══')
for (const m of match.maps) {
  console.log(
    `  [${m.mapOrder}] ${m.mapName}  ${m.teamAScore}-${m.teamBScore}  ` +
      `(A start: ${m.teamAStartSide}, picked: ${m.pickedBy})  ` +
      `[A: ${m.teamAAtkScore}atk/${m.teamADefScore}def  ` +
      `B: ${m.teamBAtkScore}atk/${m.teamBDefScore}def]`
  )
  console.log(`      rounds: ${m.rounds.length}, players: ${m.players.length}`)

  const endTypes = m.rounds.reduce<Record<string, number>>((acc, r) => {
    const k = r.endType ?? 'unknown'
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  console.log(`      end-types: ${JSON.stringify(endTypes)}`)

  console.log('      players:')
  for (const p of m.players) {
    console.log(
      `        ${p.teamSide.toUpperCase()} ${p.player.ign.padEnd(14)} ` +
        `${(p.agent ?? '—').padEnd(10)} ` +
        `ACS=${(p.acs ?? '—').toString().padStart(4)} ` +
        `K/D/A=${p.k}/${p.d}/${p.a} ` +
        `+/-=${p.plusMinus} ` +
        `FK=${p.fk ?? '—'} FD=${p.fd ?? '—'}`
    )
  }
  console.log()
}

console.log('═══ DONE ═══')
