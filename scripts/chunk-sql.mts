/**
 * Splits scripts/_out/rehydrate.sql into per-match chunks suitable for
 * passing to Supabase MCP execute_sql one at a time. Boundaries are the
 * "INSERT INTO kill_events" lines (one per match) — each chunk ends right
 * after that INSERT.
 *
 * Output: scripts/_out/chunks/NN.sql (one file per match)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'

const sql = readFileSync('scripts/_out/rehydrate.sql', 'utf8')

// Split on the "DELETE FROM kill_events" line — each match begins a new chunk
// at the previous DELETE-then-INSERT block.
const matchBlocks = sql.split(/(?=DELETE FROM kill_events )/g)

// matchBlocks[0] = everything before the first DELETE (rounds/mp/opp for match 1).
// matchBlocks[i] = "DELETE FROM kill_events ...;<INSERT>;<next match's rounds/mp/opp>...".
// We want each output chunk to be: rounds+mp+opp for match N, then its DELETE+INSERT.
// Easier: just group two consecutive blocks together so each chunk has both
// the meta-updates and its kill_events block.

const chunks: string[] = []
for (let i = 0; i < matchBlocks.length; i++) {
  chunks.push(matchBlocks[i])
}

try {
  rmSync('scripts/_out/chunks', { recursive: true, force: true })
} catch {}
mkdirSync('scripts/_out/chunks', { recursive: true })

let n = 0
for (const c of chunks) {
  const trimmed = c.trim()
  if (!trimmed) continue
  n++
  const path = `scripts/_out/chunks/${String(n).padStart(2, '0')}.sql`
  writeFileSync(path, trimmed + '\n')
}
process.stderr.write(`Wrote ${n} chunks → scripts/_out/chunks/\n`)
