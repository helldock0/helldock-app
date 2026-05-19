'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PollSlot } from '@/lib/availability-poll'

type DayGroup = { dateKey: string; label: string; slots: PollSlot[] }

export default function PollDetailClient({
  pollId,
  shareUrl,
  respondents,
  dayGroups,
  tally,
  grid,
}: {
  pollId: string
  shareUrl: string
  respondents: string[]
  dayGroups: DayGroup[]
  tally: Record<string, number>
  grid: { name: string; available: Record<string, boolean> }[]
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const totalRespondents = respondents.length
  // Use the max observed count as 'full' (everyone who responded). Lets the
  // heatmap saturate even before all expected players have answered.
  const denom = totalRespondents > 0 ? totalRespondents : 1

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  async function deletePoll() {
    if (!confirm('Delete this poll and all responses?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/polls/${pollId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      router.push('/polls')
    } catch {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Share strip */}
      <section className="bg-surface-2 border border-gold/30 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">
          share link
        </span>
        <code className="flex-1 min-w-0 text-xs font-mono text-gold truncate">
          {shareUrl}
        </code>
        <button
          type="button"
          onClick={copyLink}
          className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md bg-gold text-black font-semibold hover:bg-gold-hover transition-colors"
        >
          {copied ? 'copied!' : 'copy link'}
        </button>
        <button
          type="button"
          onClick={deletePoll}
          disabled={deleting}
          className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md text-crimson hover:bg-crimson/10 transition-colors disabled:opacity-50"
        >
          delete
        </button>
      </section>

      {/* Aggregate heatmap */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-fg">Aggregate availability</h2>
          <span className="text-2xs text-muted-2 uppercase tracking-wider">
            {totalRespondents} respondent{totalRespondents !== 1 ? 's' : ''}
          </span>
        </div>
        {totalRespondents === 0 ? (
          <div className="text-xs text-muted-2 py-6 text-center">
            no responses yet — share the link above to start collecting
          </div>
        ) : (
          <SlotGrid
            dayGroups={dayGroups}
            cellFor={(slotIso) => {
              const n = tally[slotIso] ?? 0
              const ratio = n / denom
              const bg =
                n === 0
                  ? 'bg-surface'
                  : ratio >= 1
                  ? 'bg-win-green/35'
                  : ratio >= 0.66
                  ? 'bg-win-green/22'
                  : ratio >= 0.33
                  ? 'bg-gold/20'
                  : 'bg-crimson/15'
              return {
                bg,
                label: n.toString(),
                title: `${n}/${totalRespondents} available`,
              }
            }}
          />
        )}
      </section>

      {/* Per-respondent breakdown */}
      {totalRespondents > 0 && (
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-fg mb-3">Per respondent</h2>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
                  <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-surface-2 z-10">
                    Name
                  </th>
                  {dayGroups.map((d) =>
                    d.slots.map((s) => (
                      <th
                        key={s.iso}
                        className="text-center px-1 py-1.5 font-semibold whitespace-nowrap"
                      >
                        <div className="text-[10px] text-muted-2">{s.timeOfDay}</div>
                      </th>
                    ))
                  )}
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => (
                  <tr key={row.name} className="border-b border-line">
                    <td className="px-2 py-1.5 text-fg sticky left-0 bg-surface-2 z-10">
                      {row.name}
                    </td>
                    {dayGroups.map((d) =>
                      d.slots.map((s) => (
                        <td
                          key={s.iso}
                          className={`px-1 py-1 text-center ${
                            row.available[s.iso] ? 'bg-win-green/25' : ''
                          }`}
                        >
                          {row.available[s.iso] ? '✓' : ''}
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function SlotGrid({
  dayGroups,
  cellFor,
}: {
  dayGroups: DayGroup[]
  cellFor: (iso: string) => { bg: string; label: string; title: string }
}) {
  // Each day is a column; rows are the time-of-day labels of slot 0 in that
  // day. Different days may have different slot lists if a window crosses a
  // boundary unevenly, but slot_minutes is fixed so they usually match.
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-fit">
        {dayGroups.map((d) => (
          <div key={d.dateKey} className="shrink-0">
            <div className="text-2xs uppercase tracking-wider text-muted-2 text-center mb-2 px-1 tnum">
              {d.label}
            </div>
            <div className="flex flex-col gap-px bg-line/40 rounded-md overflow-hidden border border-line">
              {d.slots.map((s) => {
                const cell = cellFor(s.iso)
                return (
                  <div
                    key={s.iso}
                    className={`flex items-center justify-between gap-3 px-2 py-1 text-xs ${cell.bg}`}
                    title={`${s.timeOfDay} · ${cell.title}`}
                  >
                    <span className="font-mono text-muted-2 tnum">
                      {s.timeOfDay}
                    </span>
                    <span className="font-mono tnum text-fg/85">{cell.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
