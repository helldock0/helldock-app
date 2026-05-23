import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import { getCurrentUserContext } from './authz'

export const TEAM_COOKIE = 'helldock_team'

/** Read-only — usable from any server component or route handler. */
export function getSelectedTeamSlug(): string | null {
  return cookies().get(TEAM_COOKIE)?.value ?? null
}

/** Server-action / route-handler only (cookies().set() is restricted). */
export function setSelectedTeamSlug(slug: string) {
  cookies().set(TEAM_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // No maxAge → session cookie (cleared on browser close). The /auth/callback
    // also explicitly deletes this on every successful auth so the per-login
    // picker is enforced even within a persistent browser session.
  })
}

/** Server-action / route-handler only. */
export function clearSelectedTeamSlug() {
  cookies().delete(TEAM_COOKIE)
}

/**
 * Require an active team for the current request. Redirects to /select-team
 * if the cookie is missing, refers to a team the user isn't a member of, or
 * refers to a non-existent team. Returns the team UUID + slug + display name
 * for use in queries.
 *
 * Platform admins can select any team that exists.
 */
export async function requireSelectedTeam(): Promise<{
  teamId: string
  teamSlug: string
  teamName: string
}> {
  const slug = getSelectedTeamSlug()
  if (!slug) redirect('/select-team')

  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  // Look up the team in the user's memberships
  for (const org of ctx.memberships) {
    const team = org.teams.find((t) => t.teamSlug === slug)
    if (team) {
      return { teamId: team.teamId, teamSlug: team.teamSlug, teamName: team.teamName }
    }
  }

  // Platform admin can select any team
  if (ctx.isPlatformAdmin) {
    const supabase = createClient()
    const { data: team } = await supabase
      .from('teams')
      .select('id, slug, name')
      .eq('slug', slug)
      .single()
    if (team) return { teamId: team.id, teamSlug: team.slug, teamName: team.name }
  }

  // Cookie names a team the user can't access — boot to picker
  redirect('/select-team')
}
