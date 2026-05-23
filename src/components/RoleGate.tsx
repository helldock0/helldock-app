import { getSelectedTeamSlug } from '@/lib/team-session'
import { getCurrentUserContext, getTeamRole, type EffectiveRole } from '@/lib/authz'

const ROLE_HIERARCHY: Record<EffectiveRole, number> = {
  player: 1,
  viewer: 1,
  coach: 2,
  org_admin: 3,
  org_owner: 3,
  platform_admin: 4,
}

export type MinRole = 'coach' | 'org_admin' | 'platform_admin'

/**
 * Server component that conditionally renders children based on the current
 * user's role for their selected team. Use to hide edit controls from players,
 * billing controls from coaches, etc. Returns `fallback` (default null) when
 * the user doesn't meet the minimum role.
 */
export async function RoleGate({
  role,
  fallback = null,
  children,
}: {
  role: MinRole
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const ctx = await getCurrentUserContext()
  if (!ctx) return <>{fallback}</>

  const slug = getSelectedTeamSlug()
  if (!slug && !ctx.isPlatformAdmin) return <>{fallback}</>

  let teamId: string | null = null
  for (const org of ctx.memberships) {
    const t = org.teams.find((x) => x.teamSlug === slug)
    if (t) {
      teamId = t.teamId
      break
    }
  }

  const effective: EffectiveRole | null = teamId
    ? getTeamRole(ctx, teamId)
    : ctx.isPlatformAdmin
      ? 'platform_admin'
      : null
  if (!effective) return <>{fallback}</>

  if (ROLE_HIERARCHY[effective] < ROLE_HIERARCHY[role]) {
    return <>{fallback}</>
  }
  return <>{children}</>
}

/**
 * Convenience: return the current user's role on the current team, or null.
 * Used by AppNav + page server components to decide what nav items to show.
 */
export async function getCurrentTeamRole(): Promise<EffectiveRole | null> {
  const ctx = await getCurrentUserContext()
  if (!ctx) return null
  const slug = getSelectedTeamSlug()
  if (!slug) return ctx.isPlatformAdmin ? 'platform_admin' : null

  for (const org of ctx.memberships) {
    const t = org.teams.find((x) => x.teamSlug === slug)
    if (t) return getTeamRole(ctx, t.teamId)
  }
  return ctx.isPlatformAdmin ? 'platform_admin' : null
}
