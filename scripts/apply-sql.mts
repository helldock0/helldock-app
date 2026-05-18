/**
 * Reads scripts/_out/rehydrate.sql and executes each statement via the
 * temporary public.exec_admin_sql RPC (SECURITY DEFINER → runs as postgres,
 * bypasses RLS). Drops the function once done by the caller.
 *
 * Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... npx tsx scripts/apply-sql.mts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_ANON_KEY ?? ''
if (!URL || !KEY) {
  console.error('SUPABASE_URL + SUPABASE_ANON_KEY required')
  process.exit(1)
}
const supabase = createClient(URL, KEY)

const sql = readFileSync('scripts/_out/rehydrate.sql', 'utf8')

// Split on ";" line-terminators followed by newline (preserves intra-string semicolons within quotes — none in our generator output)
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith('--'))

process.stderr.write(`Applying ${statements.length} statements\n`)

let ok = 0
let fail = 0
const errors: string[] = []

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i]
  const { error } = await supabase.rpc('exec_admin_sql', { query: stmt })
  if (error) {
    fail++
    errors.push(`[${i + 1}] ${error.message} :: ${stmt.slice(0, 80)}`)
  } else {
    ok++
  }
  if ((i + 1) % 50 === 0 || i === statements.length - 1) {
    process.stderr.write(`  ${i + 1}/${statements.length}  (ok=${ok} fail=${fail})\n`)
  }
}

if (errors.length > 0) {
  process.stderr.write('\nErrors:\n')
  for (const e of errors.slice(0, 20)) process.stderr.write('  ' + e + '\n')
}
process.stderr.write(`\nDone: ${ok} ok, ${fail} fail\n`)
