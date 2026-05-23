import { cache } from 'react'
import { createClient } from './supabase/server'

export type OrgRole = 'org_owner' | 'org_admin' | 'viewer'
export type TeamRole = 'coach' | 'player' | 'viewer'
export type EffectiveRole = TeamRole | OrgRole | 'platform_admin'

export type TeamMembership = {
  teamId: string
  teamSlug: string
  teamName: string
  teamRole: TeamRole
  playerId: string | null
}

export type OrgMembership = {
  orgId: string
  orgSlug: string
  orgName: string
  orgRole: OrgRole
  suspended: boolean
  teams: TeamMembership[]
}

export type UserContext = {
  userId: string
  email: string
  isPlatformAdmin: boolean
  memberships: OrgMembership[]
}

/**
 * Resolve the current user's identity + every org and team they belong to.
 * Cached per request via React.cache so multiple components in the same render
 * share one DB roundtrip.
 *
 * Returns null when there's no session. Server components should check the
 * session via supabase.auth.getUser() OR via `requireSelectedTeam()` for the
 * UI auth gate — this helper is for role/membership lookups.
 */
export const getCurrentUserContext = cache(async (): Promise<UserContext | null> => {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [
    { data: platformAdmin },
    { data: orgMemberships },
    { data: teamMemberships },
  ] = await Promise.all([
    supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('org_members')
      .select('org_id, role, orgs!inner(id, slug, name, suspended_at)')
      .eq('user_id', user.id),
    supabase
      .from('team_members')
      .select('team_id, role, player_id, teams!inner(id, slug, name, org_id)')
      .eq('user_id', user.id),
  ])

  const orgs = new Map<string, OrgMembership>()

  // Seed with explicit org memberships
  for (const om of orgMemberships ?? []) {
    const org = om.orgs as unknown as { id: string; slug: string; name: string; suspended_at: string | null }
    orgs.set(org.id, {
      orgId: org.id,
      orgSlug: org.slug,
      orgName: org.name,
      orgRole: om.role as OrgRole,
      suspended: !!org.suspended_at,
      teams: [],
    })
  }

  // Add teams; if a team's org isn't in the user's org memberships, synthesize
  // an implicit "viewer" org membership so the team still surfaces in the UI.
  for (const tm of teamMemberships ?? []) {
    const team = tm.teams as unknown as { id: string; slug: string; name: string; org_id: string }
    let org = orgs.get(team.org_id)
    if (!org) {
      org = {
        orgId: team.org_id,
        orgSlug: '',
        orgName: '',
        orgRole: 'viewer',
        suspended: false,
        teams: [],
      }
      orgs.set(team.org_id, org)
    }
    org.teams.push({
      teamId: team.id,
      teamSlug: team.slug,
      teamName: team.name,
      teamRole: tm.role as TeamRole,
      playerId: tm.player_id,
    })
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    isPlatformAdmin: !!platformAdmin,
    memberships: Array.from(orgs.values()),
  }
})

/** Return the user's effective role on a given team, or null if no access. */
export function getTeamRole(ctx: UserContext, teamId: string): EffectiveRole | null {
  if (ctx.isPlatformAdmin) return 'platform_admin'
  for (const org of ctx.memberships) {
    const direct = org.teams.find((t) => t.teamId === teamId)
    if (direct) {
      // org_owner/org_admin always wins over a more specific team role
      if (org.orgRole === 'org_owner' || org.orgRole === 'org_admin') return org.orgRole
      return direct.teamRole
    }
  }
  return null
}

export function canReadTeam(ctx: UserContext, teamId: string): boolean {
  return getTeamRole(ctx, teamId) !== null
}

export function canWriteTeam(ctx: UserContext, teamId: string): boolean {
  const role = getTeamRole(ctx, teamId)
  return role !== null && role !== 'player' && role !== 'viewer'
}
