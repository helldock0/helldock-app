import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  parseYearMonth,
  shiftMonth,
  monthName,
  formatYearMonthParam,
  monthGridRange,
  localDateKey,
  dateKeyFromTimestamp,
  buildMonthDays,
} from '@/lib/calendar'
import CalendarGrid, { type CalendarEvent } from './CalendarGrid'

export const dynamic = 'force-dynamic'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { ym?: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const ym = parseYearMonth(searchParams.ym)
  const { start, end } = monthGridRange(ym)

  // Range strings for filtering — Postgres comparisons against `match_date`
  // (a date column) use ISO yyyy-mm-dd; scheduled_at (timestamptz) uses ISO.
  const startKey = localDateKey(start)
  const endDate = new Date(end)
  endDate.setDate(endDate.getDate()) // end is already exclusive
  const endKey = localDateKey(endDate)

  const supabase = createClient()

  const [matchesRes, scrimsRes] = await Promise.all([
    supabase
      .from('matches')
      .select(
        'id, match_id_helldock, match_date, opponent_name, map_name, our_score, opp_score, result'
      )
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .gte('match_date', startKey)
      .lt('match_date', endKey),
    supabase
      .from('scrim_schedule')
      .select('id, scheduled_at, opponent_name, map_planned, match_format, notes, status, match_id')
      .eq('team_id', teamId)
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString())
      .order('scheduled_at'),
  ])

  const events: CalendarEvent[] = []

  for (const m of matchesRes.data ?? []) {
    if (!m.match_date) continue
    events.push({
      kind: 'match',
      dateKey: m.match_date,
      sortTs: new Date(m.match_date + 'T00:00:00').getTime(),
      matchIdHelldock: m.match_id_helldock,
      opp: m.opponent_name,
      map: m.map_name,
      result: m.result,
      ourScore: m.our_score,
      oppScore: m.opp_score,
    })
  }
  for (const s of scrimsRes.data ?? []) {
    events.push({
      kind: 'scrim',
      dateKey: dateKeyFromTimestamp(s.scheduled_at),
      sortTs: new Date(s.scheduled_at).getTime(),
      scrimId: s.id,
      scheduledAt: s.scheduled_at,
      opp: s.opponent_name,
      map: s.map_planned,
      format: s.match_format,
      notes: s.notes,
      status: s.status as 'scheduled' | 'cancelled' | 'completed',
      matchId: s.match_id,
    })
  }
  events.sort((a, b) => a.sortTs - b.sortTs)
  const matchCount = events.filter((event) => event.kind === 'match').length
  const scrimCount = events.filter((event) => event.kind === 'scrim').length

  const days = buildMonthDays(ym)
  const prevYm = shiftMonth(ym, -1)
  const nextYm = shiftMonth(ym, 1)

  return (
    <main className="px-6 py-6 max-w-7xl mx-auto">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
            calendar
          </p>
          <h1 className="text-2xl font-bold text-fg leading-tight mt-1">
            {monthName(ym)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/calendar?ym=${formatYearMonthParam(prevYm)}`}
            className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-line-strong/60 text-muted hover:text-fg hover:border-gold/60 transition-colors"
          >
            ← {monthName(prevYm).split(' ')[0]}
          </Link>
          <Link
            href="/app/calendar"
            className="text-2xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-line-strong/60 text-muted-2 hover:text-fg transition-colors"
          >
            today
          </Link>
          <Link
            href={`/app/calendar?ym=${formatYearMonthParam(nextYm)}`}
            className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md border border-line-strong/60 text-muted hover:text-fg hover:border-gold/60 transition-colors"
          >
            {monthName(nextYm).split(' ')[0]} →
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-2xs uppercase tracking-[0.16em] text-muted-2">
        <span className="rounded-md border border-line-strong/60 bg-surface-2 px-2.5 py-1 tnum">
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
        <span className="rounded-md border border-line-strong/60 bg-surface-2 px-2.5 py-1 tnum">
          {scrimCount} scheduled
        </span>
        {scrimCount === 0 && (
          <span className="text-muted">No scrims scheduled this month</span>
        )}
      </div>

      <CalendarGrid days={days} events={events} activeMonth={ym.month} />
    </main>
  )
}
