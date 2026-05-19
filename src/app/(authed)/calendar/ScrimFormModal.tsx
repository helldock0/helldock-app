'use client'

import { useEffect, useState } from 'react'
import type { CalendarEvent } from './CalendarGrid'

type ScrimEvent = Extract<CalendarEvent, { kind: 'scrim' }>

type Initial =
  | { dateKey: string } // create new — dateKey provides the date, time defaults to 19:00
  | { event: ScrimEvent }

type FormState = {
  date: string // yyyy-mm-dd
  time: string // HH:mm
  opponent_name: string
  map_planned: string
  match_format: string
  notes: string
  status: 'scheduled' | 'cancelled' | 'completed'
}

function initialFor(init: Initial): FormState {
  if ('event' in init) {
    const d = new Date(init.event.scheduledAt)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const time = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return {
      date,
      time,
      opponent_name: init.event.opp ?? '',
      map_planned: init.event.map ?? '',
      match_format: init.event.format ?? '',
      notes: init.event.notes ?? '',
      status: init.event.status,
    }
  }
  return {
    date: init.dateKey,
    time: '19:00',
    opponent_name: '',
    map_planned: '',
    match_format: '',
    notes: '',
    status: 'scheduled',
  }
}

export default function ScrimFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Initial
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(() => initialFor(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = 'event' in initial
  const scrimId = 'event' in initial ? initial.event.scrimId : null

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    // Combine date + time as a local ISO string; the browser converts to UTC.
    const scheduledAt = new Date(`${form.date}T${form.time}:00`).toISOString()
    const body = {
      scheduled_at: scheduledAt,
      opponent_name: form.opponent_name.trim() || null,
      map_planned: form.map_planned.trim() || null,
      match_format: form.match_format.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    }

    try {
      const url = scrimId ? `/api/scrim-schedule/${scrimId}` : '/api/scrim-schedule'
      const method = scrimId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed')
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!scrimId) return
    if (!confirm('Delete this scheduled scrim?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/scrim-schedule/${scrimId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'delete failed')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/85"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative bg-surface border border-line-strong rounded-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-line">
          <div>
            <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
              {editing ? 'edit scheduled scrim' : 'schedule scrim'}
            </p>
            <h2 className="text-xl font-bold text-fg leading-tight mt-0.5">
              {form.opponent_name || 'TBD'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-fg text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                required
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Opponent">
            <input
              type="text"
              value={form.opponent_name}
              onChange={(e) => setForm({ ...form, opponent_name: e.target.value })}
              placeholder="Team name"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Map planned">
              <input
                type="text"
                value={form.map_planned}
                onChange={(e) => setForm({ ...form, map_planned: e.target.value })}
                placeholder="Bind…"
                className={inputCls}
              />
            </Field>
            <Field label="Format">
              <input
                type="text"
                value={form.match_format}
                onChange={(e) => setForm({ ...form, match_format: e.target.value })}
                placeholder="BO1, BO3…"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls + ' resize-none'}
            />
          </Field>

          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as FormState['status'] })
              }
              className={inputCls + ' cursor-pointer'}
            >
              <option value="scheduled">Scheduled</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </Field>

          {error && (
            <div className="text-xs text-crimson bg-crimson/10 border border-crimson/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            {editing ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-xs uppercase tracking-wider text-crimson hover:underline disabled:opacity-50"
              >
                delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md text-muted hover:text-fg transition-colors disabled:opacity-50"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-md bg-gold text-black font-semibold hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                {saving ? 'saving…' : editing ? 'save' : 'schedule'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'bg-surface-2 border border-line-strong rounded-md px-2 py-1.5 text-sm text-fg w-full focus:outline-none focus:border-gold/60 placeholder:text-muted-2'

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-2xs uppercase tracking-wider text-muted-2 block mb-1">
        {label}
      </span>
      {children}
    </label>
  )
}
