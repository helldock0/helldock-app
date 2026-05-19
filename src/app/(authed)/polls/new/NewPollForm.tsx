'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function defaultDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function NewPollForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState(defaultDate(0))
  const [startTime, setStartTime] = useState('18:00')
  const [endDate, setEndDate] = useState(defaultDate(0))
  const [endTime, setEndTime] = useState('23:00')
  const [slotMinutes, setSlotMinutes] = useState<15 | 30 | 60>(30)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const startIso = new Date(`${startDate}T${startTime}:00`).toISOString()
    const endIso = new Date(`${endDate}T${endTime}:00`).toISOString()

    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          start_at: startIso,
          end_at: endIso,
          slot_minutes: slotMinutes,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const t = await res.text()
        throw new Error(t || `HTTP ${res.status}`)
      }
      const created = await res.json()
      router.push(`/polls/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
      <Field label="Title (optional)">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Scrim window — Sat 23 May"
          className={inputCls}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date">
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (!endDate || endDate < e.target.value) setEndDate(e.target.value)
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Start time">
          <input
            type="time"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="End date">
          <input
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="End time">
          <input
            type="time"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <Field label="Slot size">
        <div className="inline-flex rounded-md border border-line-strong overflow-hidden text-xs">
          {[15, 30, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSlotMinutes(m as 15 | 30 | 60)}
              className={`px-3 py-1.5 transition-colors ${
                slotMinutes === m
                  ? 'bg-gold text-black font-semibold'
                  : 'bg-surface text-muted hover:text-fg'
              }`}
            >
              {m} min
            </button>
          ))}
        </div>
      </Field>

      <Field label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else the players should know"
          className={inputCls + ' resize-none'}
        />
      </Field>

      {error && (
        <div className="text-xs text-crimson bg-crimson/10 border border-crimson/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="text-sm uppercase tracking-wider px-4 py-2 rounded-md bg-gold text-black font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'creating…' : 'create poll'}
        </button>
      </div>
    </form>
  )
}

const inputCls =
  'bg-surface border border-line-strong rounded-md px-2 py-1.5 text-sm text-fg w-full focus:outline-none focus:border-gold/60 placeholder:text-muted-2'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-2xs uppercase tracking-wider text-muted-2 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
