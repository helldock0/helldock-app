'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/

/** Create the user's org. Caller becomes org_owner. */
export async function createOrgAction(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  if (!name) redirect('/onboarding?error=org_name')
  if (!SLUG_RE.test(slug)) redirect('/onboarding?error=org_slug')

  const admin = createAdminClient()
  const { data: org, error } = await admin
    .from('orgs')
    .insert({ name, slug, plan: 'alpha' })
    .select('id')
    .single()
  if (error || !org) {
    if (error?.code === '23505') redirect('/onboarding?error=org_slug_taken')
    console.warn('[onboarding] org insert failed:', error?.message)
    redirect('/onboarding?error=org_db')
  }

  const { error: omErr } = await admin.from('org_members').insert({
    org_id: org.id,
    user_id: user.id,
    role: 'org_owner',
  })
  if (omErr) console.warn('[onboarding] org_members insert failed:', omErr.message)

  redirect('/onboarding')
}

/** Create the user's first team in their org. Caller becomes coach. */
export async function createTeamAction(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Find the user's most-recent org_owner org
  const { data: ownership } = await admin
    .from('org_members')
    .select('org_id, orgs!inner(id, slug)')
    .eq('user_id', user.id)
    .eq('role', 'org_owner')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ownership) redirect('/onboarding?error=no_org')

  const orgId = ownership.org_id
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const riotName = String(formData.get('riot_name') ?? '').trim()
  const riotTag = String(formData.get('riot_tag') ?? '').trim()

  if (!name) redirect('/onboarding?error=team_name')
  if (!SLUG_RE.test(slug)) redirect('/onboarding?error=team_slug')

  // teams table currently uses an org-global slug. Prefix with org_slug to avoid collisions.
  // (Schema unique constraint is on teams.slug — we'll revisit in Phase 6 if it becomes a problem.)
  const finalSlug = slug // hot-fixable: ${orgSlug}_${slug} if we add cross-org collisions later

  const { data: team, error } = await admin
    .from('teams')
    .insert({
      slug: finalSlug,
      name,
      org_id: orgId,
    })
    .select('id, slug')
    .single()
  if (error || !team) {
    if (error?.code === '23505') redirect('/onboarding?error=team_slug_taken')
    console.warn('[onboarding] team insert failed:', error?.message)
    redirect('/onboarding?error=team_db')
  }

  await admin.from('team_members').insert({
    team_id: team.id,
    user_id: user.id,
    role: 'coach',
  })

  // Optional: create a placeholder main-player row if Riot ID given
  if (riotName && riotTag) {
    const { data: player } = await admin
      .from('players')
      .insert({
        team_id: team.id,
        display_name: riotName,
        riot_name: riotName,
        riot_tag: riotTag,
        roster_status: 'main',
      })
      .select('id')
      .single()
    if (player) {
      await admin.from('player_accounts').insert({
        player_id: player.id,
        riot_name: riotName,
        riot_tag: riotTag,
        is_primary: true,
        label: 'main',
      })
    }
  }

  redirect('/app/select-team')
}
