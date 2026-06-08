import type { UserContext } from './authz'

export type RosterTransferTeam = {
  id: string
  slug: string
  name: string
}

export type RosterTransferPlayer = {
  id: string
  team_id: string | null
  riot_name: string | null
  riot_tag: string | null
}

export type RosterTransferPlan =
  | {
      kind: 'move'
      sourcePlayerId: string
      targetTeamId: string
    }
  | {
      kind: 'merge'
      sourcePlayerId: string
      duplicatePlayerId: string
      targetTeamId: string
    }

export function getRosterTransferTargets(
  ctx: UserContext,
  currentTeamId: string,
  allTeams: RosterTransferTeam[] = []
): RosterTransferTeam[] {
  const currentOrg = ctx.memberships.find((org) =>
    org.teams.some((team) => team.teamId === currentTeamId)
  )
  const sourceTeams =
    ctx.isPlatformAdmin
      ? allTeams
      : currentOrg?.teams.map((team) => ({
          id: team.teamId,
          slug: team.teamSlug,
          name: team.teamName,
        })) ?? []

  const seen = new Set<string>()
  const targets: RosterTransferTeam[] = []

  for (const team of sourceTeams) {
    if (team.id === currentTeamId || seen.has(team.id)) continue
    if (!canWriteTeamFromContext(ctx, team.id)) continue
    seen.add(team.id)
    targets.push(team)
  }

  return targets.sort((a, b) => a.name.localeCompare(b.name))
}

export function planRosterTransfer({
  sourcePlayer,
  targetTeamId,
  duplicateTargetPlayer,
}: {
  sourcePlayer: RosterTransferPlayer
  targetTeamId: string
  duplicateTargetPlayer: RosterTransferPlayer | null
}): RosterTransferPlan {
  if (duplicateTargetPlayer && duplicateTargetPlayer.id !== sourcePlayer.id) {
    return {
      kind: 'merge',
      sourcePlayerId: sourcePlayer.id,
      duplicatePlayerId: duplicateTargetPlayer.id,
      targetTeamId,
    }
  }

  return {
    kind: 'move',
    sourcePlayerId: sourcePlayer.id,
    targetTeamId,
  }
}

export function canWriteTeamFromContext(ctx: UserContext, teamId: string): boolean {
  if (ctx.isPlatformAdmin) return true

  for (const org of ctx.memberships) {
    const team = org.teams.find((t) => t.teamId === teamId)
    if (!team) continue
    if (org.orgRole === 'org_owner' || org.orgRole === 'org_admin') return true
    return team.teamRole !== 'player' && team.teamRole !== 'viewer'
  }

  return false
}
