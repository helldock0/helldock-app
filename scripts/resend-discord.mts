/**
 * One-off: re-fire the Discord webhook for the most recent match.
 *
 * Loads .env.local via Node's --env-file flag, picks the latest non-deleted
 * match (across both teams), and calls notifyDiscordForMatch directly using
 * the service-role Supabase client.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/resend-discord.mts
 *   npx tsx --env-file=.env.local scripts/resend-discord.mts M042
 *   npx tsx --env-file=.env.local scripts/resend-discord.mts --team=hydra
 *   npx tsx --env-file=.env.local scripts/resend-discord.mts --team=scylla M042
 */
import { createClient } from '@supabase/supabase-js'
import { notifyDiscordForMatch } from '../src/lib/discord'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://helldock-app.vercel.app'

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  )
  process.exit(1)
}

// Parse args: positional helldock id (e.g. "M042"), optional --team=<slug>
const args = process.argv.slice(2)
const teamArg = args.find((a) => a.startsWith('--team='))?.split('=')[1]
const argId = args.find((a) => !a.startsWith('--'))

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  // Resolve team filter (if any) to a team UUID.
  let teamIdFilter: string | null = null
  if (teamArg) {
    const { data: t } = await supabase
      .from('teams')
      .select('id, slug, name')
      .eq('slug', teamArg)
      .maybeSingle()
    if (!t) {
      console.error(`Unknown team slug: ${teamArg}`)
      process.exit(1)
    }
    teamIdFilter = t.id
    console.log(`Filtering to team ${t.name} (${t.slug})`)
  }

  let q = supabase
    .from('matches')
    .select(
      'id, match_id_helldock, team_id, map_name, opponent_name, result, our_score, opp_score, match_date'
    )
    .is('deleted_at', null)
  if (teamIdFilter) q = q.eq('team_id', teamIdFilter)

  const { data, error } = argId
    ? await q.eq('match_id_helldock', argId).maybeSingle()
    : await q.order('match_date', { ascending: false }).limit(1).maybeSingle()

  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  if (!data) {
    console.error(argId ? `No match found with helldock id ${argId}` : 'No matches found')
    process.exit(1)
  }

  console.log(
    `Resending Discord notification for ${data.match_id_helldock} ` +
      `(${data.map_name} ${data.our_score}-${data.opp_score} ${data.result} vs ${data.opponent_name}, ${data.match_date})`
  )

  await notifyDiscordForMatch(supabase, data.team_id, data.id, BASE_URL)
  console.log('Done — check Discord.')
}

main().catch((e) => {
  console.error('Script failed:', e)
  process.exit(1)
})
