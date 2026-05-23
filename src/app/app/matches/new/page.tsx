import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import NewMatchForm from './NewMatchForm'

export default async function NewMatchPage() {
  const { teamId, teamSlug, teamName } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: players } = await supabase
    .from('players')
    .select('id, display_name, team_id')
    .eq('team_id', teamId)
    .order('display_name')

  return (
    <main className="px-6 py-6 max-w-4xl mx-auto">
      <Link
        href="/app/matches"
        className="inline-flex items-center gap-1 text-muted-2 hover:text-gold text-2xs uppercase tracking-[0.16em] mb-3 transition-colors"
      >
        ← back to matches
      </Link>
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">log</p>
        <h1 className="text-2xl font-bold text-fg leading-tight mt-1">New match</h1>
      </div>
      <NewMatchForm
        lockedTeamSlug={teamSlug}
        lockedTeamName={teamName}
        players={players ?? []}
      />
    </main>
  )
}
