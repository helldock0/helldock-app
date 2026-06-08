export type AnalyticsTeamOption = {
  id: string
  slug: string
  name: string
}

export type AnalyticsTeamScope = {
  teamIds: string[]
  teamSlug: string
  teamName: string
  options: AnalyticsTeamOption[]
}

export function resolveAnalyticsTeamScope({
  readableTeams,
  selectedTeamSlug,
  requestedTeam,
}: {
  readableTeams: AnalyticsTeamOption[]
  selectedTeamSlug: string
  requestedTeam?: string
}): AnalyticsTeamScope {
  const options = readableTeams.filter(
    (team, index, all) => all.findIndex((t) => t.id === team.id) === index
  )
  const bySlug = new Map(options.map((team) => [team.slug, team]))
  const selected = bySlug.get(selectedTeamSlug) ?? options[0]

  if (requestedTeam === 'all' && options.length > 1) {
    return {
      teamIds: options.map((team) => team.id),
      teamSlug: 'all',
      teamName: 'All teams',
      options,
    }
  }

  const requested = requestedTeam ? bySlug.get(requestedTeam) : null
  const active = requested ?? selected

  if (!active) {
    return { teamIds: [], teamSlug: selectedTeamSlug, teamName: selectedTeamSlug, options }
  }

  return {
    teamIds: [active.id],
    teamSlug: active.slug,
    teamName: active.name,
    options,
  }
}
