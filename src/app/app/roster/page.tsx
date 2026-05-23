import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import RosterClient from './RosterClient'

export const dynamic = 'force-dynamic'

export type PlayerAccountRow = {
  id: string
  riot_name: string
  riot_tag: string
  puuid: string | null
  is_primary: boolean
  label: string | null
}

export type PlayerRow = {
  id: string
  display_name: string
  riot_name: string | null
  riot_tag: string | null
  main_role: string | null
  main_agent: string | null
  roster_status: 'main' | 'sub' | 'trial'
  is_active: boolean
  accounts: PlayerAccountRow[]
  match_count: number
}

export default async function RosterPage() {
  const { teamId, teamName, teamSlug } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: players } = await supabase
    .from('players')
    .select(
      'id, display_name, riot_name, riot_tag, main_role, main_agent, roster_status, is_active, accounts:player_accounts(id, riot_name, riot_tag, puuid, is_primary, label)'
    )
    .eq('team_id', teamId)
    .order('roster_status', { ascending: true })
    .order('display_name', { ascending: true })

  const playerIds = (players ?? []).map((p) => p.id)
  const matchCounts = new Map<string, number>()
  if (playerIds.length > 0) {
    const { data: counts } = await supabase
      .from('match_players')
      .select('player_id')
      .in('player_id', playerIds)
    for (const row of counts ?? []) {
      if (!row.player_id) continue
      matchCounts.set(row.player_id, (matchCounts.get(row.player_id) ?? 0) + 1)
    }
  }

  const rows: PlayerRow[] = (players ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    riot_name: p.riot_name,
    riot_tag: p.riot_tag,
    main_role: p.main_role,
    main_agent: p.main_agent,
    roster_status: (p.roster_status ?? 'main') as 'main' | 'sub' | 'trial',
    is_active: p.is_active ?? true,
    accounts: (p.accounts ?? []) as PlayerAccountRow[],
    match_count: matchCounts.get(p.id) ?? 0,
  }))

  return <RosterClient teamId={teamId} teamName={teamName} teamSlug={teamSlug} players={rows} />
}
