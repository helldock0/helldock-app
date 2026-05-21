import { fetchMatchByIdV4 } from '../src/lib/henrik/client'
import { createAdminClient } from '../src/lib/supabase/admin'

const sb = createAdminClient()
const { data: m } = await sb
  .from('matches')
  .select('henrik_id')
  .eq('match_id_helldock', 'M026')
  .single()

if (!m?.henrik_id) {
  console.error('no henrik_id for M026')
  process.exit(1)
}

const raw = await fetchMatchByIdV4(m.henrik_id, 'ap', process.env.HENRIK_API_KEY ?? '')
const rnd0 = raw?.rounds?.[0]
const stats0 = rnd0?.stats?.[0] ?? {}

console.log('Round-stats[0] top-level keys:', Object.keys(stats0).join(', '))
console.log()
console.log('stats0.stats:', JSON.stringify(stats0.stats ?? null))
console.log('stats0.damage:', JSON.stringify(stats0.damage ?? null))
console.log('stats0.economy:', JSON.stringify(stats0.economy ?? null))
console.log('stats0.ability_casts:', JSON.stringify(stats0.ability_casts ?? null))
console.log('stats0.player:', JSON.stringify(stats0.player ?? null))

// dump full first entry minified for inspection
console.log()
console.log('FULL stats[0]:')
console.log(JSON.stringify(stats0, null, 2))
