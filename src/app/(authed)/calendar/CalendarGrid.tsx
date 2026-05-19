'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { localDateKey, timeOfDay } from '@/lib/calendar'
import ScrimFormModal from './ScrimFormModal'

export type CalendarEvent =
  | {
      kind: 'match'
      dateKey: string // yyyy-mm-dd
      sortTs: number
      matchIdHelldock: string
      opp: string | null
      map: string | null
      result: string | null
      ourScore: number | null
      oppScore: number | null
    }
  | {
      kind: 'scrim'
      dateKey: string
      sortTs: number
      scrimId: string
      scheduledAt: string
      opp: string | null
      map: string | null
      format: string | null
      notes: string | null
      status: 'scheduled' | 'cancelled' | 'completed'
      matchId: string | null
    }

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function CalendarGrid({
  days,
  events,
  activeMonth,
}: {
  days: Date[]
  events: CalendarEvent[]
  activeMonth: number // 1-12
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<
    | { mode: 'create'; dateKey: string }
    | { mode: 'edit'; event: Extract<CalendarEvent, { kind: 'scrim' }> }
    | null
  >(null)

  const todayKey = localDateKey(new Date())
  const byDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {}
    for (const e of events) {
      m[e.dateKey] = m[e.dateKey] ?? []
      m[e.dateKey].push(e)
    }
    return m
  }, [events])

  function onScrimSaved() {
    setEditing(null)
    router.refresh()
  }

  return (
    <>
      <div className="grid grid-cols-7 gap-px bg-line-strong/40 rounded-lg overflow-hidden border border-line-strong/40">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="bg-surface-2 text-2xs uppercase tracking-[0.16em] text-muted-2 px-2 py-1.5 text-center"
          >
            {d}
          </div>
        ))}

        {days.map((d) => {
          const dateKey = localDateKey(d)
          const inMonth = d.getMonth() + 1 === activeMonth
          const isToday = dateKey === todayKey
          const dayEvents = byDate[dateKey] ?? []

          return (
            <div
              key={dateKey}
              className={`min-h-[110px] p-1.5 flex flex-col gap-1 ${
                inMonth ? 'bg-surface-2' : 'bg-surface'
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`tnum ${
                    isToday
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold text-black font-bold'
                      : inMonth
                      ? 'text-fg/80'
                      : 'text-muted-2'
                  }`}
                >
                  {d.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing({ mode: 'create', dateKey })}
                  title="Schedule scrim"
                  className="text-2xs text-muted-2 hover:text-gold transition-colors px-1"
                >
                  +
                </button>
              </div>
              <div className="flex flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, 4).map((e) =>
                  e.kind === 'match' ? (
                    <Link
                      key={`m-${e.matchIdHelldock}`}
                      href={`/matches/${e.matchIdHelldock}`}
                      className={`text-2xs px-1.5 py-0.5 rounded border truncate ${
                        e.result === 'W'
                          ? 'border-win-green/40 bg-win-green/10 text-win-green'
                          : e.result === 'L'
                          ? 'border-crimson/40 bg-crimson/10 text-crimson'
                          : 'border-line text-muted'
                      }`}
                      title={`${e.result ?? '—'} · ${e.map ?? '—'} vs ${e.opp ?? '—'} · ${
                        e.ourScore ?? '—'
                      }-${e.oppScore ?? '—'}`}
                    >
                      <span className="font-bold mr-1">{e.result ?? '·'}</span>
                      {e.opp ?? e.map ?? e.matchIdHelldock}
                    </Link>
                  ) : (
                    <button
                      key={`s-${e.scrimId}`}
                      type="button"
                      onClick={() => setEditing({ mode: 'edit', event: e })}
                      className={`text-2xs px-1.5 py-0.5 rounded border truncate text-left ${
                        e.status === 'cancelled'
                          ? 'border-line text-muted-2 line-through'
                          : e.status === 'completed'
                          ? 'border-gold/30 bg-gold/5 text-gold/80'
                          : 'border-gold/40 bg-gold/10 text-gold'
                      }`}
                      title={`${e.status} · ${timeOfDay(e.scheduledAt)} · ${
                        e.format ?? 'scrim'
                      } · ${e.opp ?? 'TBD'}`}
                    >
                      <span className="font-mono mr-1">
                        {timeOfDay(e.scheduledAt)}
                      </span>
                      {e.opp ?? 'TBD'}
                    </button>
                  )
                )}
                {dayEvents.length > 4 && (
                  <span className="text-2xs text-muted-2 px-1">
                    +{dayEvents.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <ScrimFormModal
          initial={
            editing.mode === 'create'
              ? { dateKey: editing.dateKey }
              : { event: editing.event }
          }
          onClose={() => setEditing(null)}
          onSaved={onScrimSaved}
        />
      )}
    </>
  )
}
