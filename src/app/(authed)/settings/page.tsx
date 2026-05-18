import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import SettingsClient from './SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const { teamId, teamName } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: team } = await supabase
    .from('teams')
    .select('discord_webhook_url')
    .eq('id', teamId)
    .single()

  return (
    <SettingsClient
      teamName={teamName}
      initialWebhook={team?.discord_webhook_url ?? null}
    />
  )
}
