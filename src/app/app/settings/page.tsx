import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export type RosterPlayer = { id: string; display_name: string }

export type CaptureTokenRow = {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  player_id: string
  player_name: string
}

export default async function SettingsPage() {
  const { teamId, teamName } = await requireSelectedTeam()
  const supabase = createClient()

  const [{ data: team }, { data: rosterRows }, { data: tokenRows }] = await Promise.all([
    supabase.from('teams').select('discord_webhook_url, slug').eq('id', teamId).single(),
    supabase
      .from('players')
      .select('id, display_name')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('display_name'),
    supabase
      .from('capture_tokens')
      .select(`
        id, label, created_at, last_used_at, revoked_at,
        players!inner(id, display_name)
      `)
      .eq('team_id', teamId)
      .order('created_at', { ascending: false }),
  ])

  const roster: RosterPlayer[] = (rosterRows ?? []) as RosterPlayer[]
  const tokens: CaptureTokenRow[] = (tokenRows ?? []).map((r) => {
    const player = r.players as unknown as { id: string; display_name: string }
    return {
      id: r.id,
      label: r.label,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
      player_id: player.id,
      player_name: player.display_name,
    }
  })

  return (
    <SettingsClient
      teamName={teamName}
      teamSlug={(team as { slug?: string } | null)?.slug ?? ''}
      initialWebhook={team?.discord_webhook_url ?? null}
      roster={roster}
      initialTokens={tokens}
    />
  )
}
