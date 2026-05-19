'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PollSlot } from '@/lib/availability-poll'

type DayGroup = { dateKey: string; label: string; slots: PollSlot[] }

const NAME_KEY = (token: string) => `helldock_poll_name_${token}`

export default function PublicPollClient({
  token,
  dayGroups,
  tally,
  totalRespondents,
  existingResponses,
}: {
  token: string
  dayGroups: DayGroup[]
  tally: Record<string, number>
  totalRespondents: number
  existingResponses: { respondent_name: string; slot_at: string }[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dragMode = useRef<'add' | 'remove' | null>(null)
  const allSlots = useMemo(() => dayGroups.flatMap((d) => d.slots), [dayGroups])

  // Restore the name (and that respondent's prior choices) from localStorage
  // so a player who closes and reopens the link keeps editing the same row.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NAME_KEY(token))
      if (stored) {
        setName(stored)
        const mine = existingResponses
          .filter((r) => r.respondent_name === stored)
          .map((r) => r.slot_at)
        setSelected(new Set(mine))
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleSlot(iso: string, forceMode?: 'add' | 'remove') {
    setSelected((prev) => {
      const next = new Set(prev)
      const mode =
        forceMode ?? (next.has(iso) ? 'remove' : 'add')
      if (mode === 'add') next.add(iso)
      else next.delete(iso)
      return next
    })
  }

  function startDrag(iso: string) {
    const isOn = selected.has(iso)
    dragMode.current = isOn ? 'remove' : 'add'
    toggleSlot(iso, dragMode.current)
  }

  function dragOver(iso: string) {
    if (!dragMode.current) return
    toggleSlot(iso, dragMode.current)
  }

  function endDrag() {
    dragMode.current = null
  }

  function selectAll() {
    setSelected(new Set(allSlots.map((s) => s.iso)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) {
      setError('Enter your name first')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/poll-by-token/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          respondent_name: cleanName,
          slot_ats: Array.from(selected),
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `HTTP ${res.status}`)
      }
      try {
        window.localStorage.setItem(NAME_KEY(token), cleanName)
      } catch {
        // ignore
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <label className="block">
        <span className="text-2xs uppercase tracking-wider text-muted-2 block mb-1">
          your name
        </span>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bumi"
          maxLength={80}
          className="bg-surface-2 border border-line-strong rounded-md px-3 py-2 text-sm text-fg w-full focus:outline-none focus:border-gold/60 placeholder:text-muted-2"
        />
      </label>

      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-4">
        <div className="flex items-baseline justify-between mb-3 gap-2">
          <h2 className="text-sm font-semibold text-fg">Mark when you&apos;re free</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-2xs uppercase tracking-wider px-2 py-1 rounded text-muted hover:text-fg transition-colors"
            >
              all
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-2xs uppercase tracking-wider px-2 py-1 rounded text-muted hover:text-fg transition-colors"
            >
              none
            </button>
          </div>
        </div>
        <p className="text-2xs text-muted-2 mb-3">
          Tap a slot to toggle, or drag to paint multiple slots.
        </p>
        <div
          className="overflow-x-auto select-none"
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchEnd={endDrag}
        >
          <div className="flex gap-2 min-w-fit">
            {dayGroups.map((d) => (
              <div key={d.dateKey} className="shrink-0">
                <div className="text-2xs uppercase tracking-wider text-muted-2 text-center mb-2 px-1 tnum">
                  {d.label}
                </div>
                <div className="flex flex-col gap-px bg-line/40 rounded-md overflow-hidden border border-line">
                  {d.slots.map((s) => {
                    const isMine = selected.has(s.iso)
                    const others = (tally[s.iso] ?? 0)
                    return (
                      <button
                        key={s.iso}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          startDrag(s.iso)
                        }}
                        onMouseEnter={() => dragOver(s.iso)}
                        onTouchStart={() => startDrag(s.iso)}
                        className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs cursor-pointer transition-colors min-w-[140px] ${
                          isMine
                            ? 'bg-gold/40 text-fg font-medium'
                            : others > 0
                            ? 'bg-win-green/12 hover:bg-gold/15'
                            : 'bg-surface hover:bg-gold/10'
                        }`}
                        title={`${s.timeOfDay}${others > 0 ? ` · ${others} other${others !== 1 ? 's' : ''} free` : ''}`}
                      >
                        <span className="font-mono text-muted-2 tnum">
                          {s.timeOfDay}
                        </span>
                        <span className="text-2xs tnum text-muted">
                          {others > 0 ? `${others}` : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-line text-2xs text-muted-2">
          Gold = your selection · faint green = at least one other person is
          free · {totalRespondents} respondent{totalRespondents !== 1 ? 's' : ''} so far
        </div>
      </div>

      {error && (
        <div className="text-xs text-crimson bg-crimson/10 border border-crimson/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {saved && (
          <span className="text-xs text-win-green">saved ✓</span>
        )}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="text-sm uppercase tracking-wider px-4 py-2 rounded-md bg-gold text-black font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'saving…' : 'save my availability'}
        </button>
      </div>
    </form>
  )
}
