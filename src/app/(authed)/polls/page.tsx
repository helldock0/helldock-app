import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'

export const dynamic = 'force-dynamic'

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const sameDay = start.toDateString() === end.toDateString()
  if (sameDay) {
    return `${start.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} · ${start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}–${end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }
  return `${start.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}–${end.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`
}

export default async function PollsListPage() {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()
  const { data: polls } = await supabase
    .from('availability_poll')
    .select('id, token, title, start_at, end_at, slot_minutes, created_at')
    .eq('team_id', teamId)
    .order('start_at', { ascending: false })

  return (
    <main className="px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
            availability polls
          </p>
          <h1 className="text-2xl font-bold text-fg leading-tight mt-1">
            Find a scrim time
          </h1>
        </div>
        <Link
          href="/polls/new"
          className="bg-gold text-black font-semibold px-4 py-2 rounded-md text-sm hover:bg-gold-hover transition-colors"
        >
          + New poll
        </Link>
      </div>

      {(polls ?? []).length === 0 ? (
        <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-8 text-center text-muted">
          No polls yet. Create one to send your team a shareable when2meet-style
          link.
        </div>
      ) : (
        <div className="space-y-2">
          {(polls ?? []).map((p) => (
            <Link
              key={p.id}
              href={`/polls/${p.id}`}
              className="block bg-surface-2 border border-line-strong/40 rounded-xl px-4 py-3 hover:border-gold/40 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-fg font-medium truncate">
                  {p.title ?? 'untitled poll'}
                </span>
                <span className="text-2xs text-muted-2 tnum shrink-0">
                  {p.slot_minutes}m slots
                </span>
              </div>
              <div className="text-xs text-muted mt-0.5">
                {formatRange(p.start_at, p.end_at)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
