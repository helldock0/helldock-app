'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAPS, AGENTS, MATCH_TYPES, PICKS, SIDES } from '@/lib/valorant'

type Player = { id: string; display_name: string; team_id: string }

type OurRow = { player_id: string; agent: string }

function todayISO() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const inputClass =
  'w-full bg-surface border border-line-strong text-fg rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold transition-colors'
const labelClass = 'block text-muted-2 text-xs uppercase tracking-wide mb-1'

export default function NewMatchForm({
  lockedTeamSlug,
  lockedTeamName,
  players,
}: {
  lockedTeamSlug: string
  lockedTeamName: string
  players: Player[]
}) {
  const router = useRouter()

  const [matchDate, setMatchDate] = useState(todayISO())
  const [matchType, setMatchType] = useState<string>('Scrim')
  const [opponentName, setOpponentName] = useState('')
  const [mapName, setMapName] = useState<string>(MAPS[0])
  const [pick, setPick] = useState<string>('Our Pick')
  const [startSide, setStartSide] = useState<string>('Attack')
  const [ourScore, setOurScore] = useState<number>(13)
  const [oppScore, setOppScore] = useState<number>(0)
  const [vibeTag, setVibeTag] = useState('')
  const [notes, setNotes] = useState('')

  const [ourRows, setOurRows] = useState<OurRow[]>(
    Array.from({ length: 5 }, () => ({ player_id: '', agent: '' }))
  )
  const [oppAgents, setOppAgents] = useState<string[]>(Array(5).fill(''))

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Roster is already pre-filtered to the current team by the server page.
  const rosterPlayers = useMemo(() => players, [players])

  function updateOurRow(idx: number, field: keyof OurRow, value: string) {
    setOurRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  function updateOppAgent(idx: number, value: string) {
    setOppAgents((arr) => arr.map((a, i) => (i === idx ? value : a)))
  }

  const canSubmit =
    !!matchDate &&
    !!matchType &&
    opponentName.trim().length > 0 &&
    !!mapName &&
    !!pick &&
    !!startSide &&
    ourRows.every((r) => r.player_id && r.agent)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || submitting) return

    setSubmitting(true)
    setError(null)

    const payload = {
      team_slug: lockedTeamSlug,
      match_date: matchDate,
      match_type: matchType,
      opponent_name: opponentName.trim(),
      map_name: mapName,
      pick,
      start_side: startSide,
      our_score: ourScore,
      opp_score: oppScore,
      our_players: ourRows.map((r) => ({ player_id: r.player_id, agent: r.agent })),
      opp_agents: oppAgents,
      vibe_tag: vibeTag.trim() || null,
      notes: notes.trim() || null,
    }

    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Save failed (${res.status})`)
        setSubmitting(false)
        return
      }

      const data: { match_id_helldock: string } = await res.json()
      router.push(`/app/matches/${data.match_id_helldock}?edit=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Top meta */}
      <section className="bg-surface-2 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Team</label>
          <div className="flex items-center gap-2 h-[38px] px-3 rounded-lg border border-line-strong bg-surface">
            <span className="text-2xs uppercase tracking-[0.18em] px-2 py-0.5 rounded border border-gold/40 bg-gold/10 text-gold font-bold">
              {lockedTeamSlug}
            </span>
            <span className="text-sm text-fg truncate">{lockedTeamName}</span>
          </div>
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input
            type="date"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value)}
            className={inputClass}
          >
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Opponent</label>
          <input
            type="text"
            value={opponentName}
            onChange={(e) => setOpponentName(e.target.value)}
            placeholder="Team Nexus"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Map</label>
          <select
            value={mapName}
            onChange={(e) => setMapName(e.target.value)}
            className={inputClass}
          >
            {MAPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Pick</label>
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputClass}>
            {PICKS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Start Side</label>
          <select
            value={startSide}
            onChange={(e) => setStartSide(e.target.value)}
            className={inputClass}
          >
            {SIDES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Our Score</label>
          <input
            type="number"
            min={0}
            max={30}
            value={ourScore}
            onChange={(e) => setOurScore(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Opp Score</label>
          <input
            type="number"
            min={0}
            max={30}
            value={oppScore}
            onChange={(e) => setOppScore(Number(e.target.value) || 0)}
            className={inputClass}
          />
        </div>
      </section>

      {/* Our players */}
      <section className="bg-surface-2 rounded-xl p-5">
        <h2 className="text-gold text-sm uppercase tracking-wide mb-3">Our Lineup</h2>
        <div className="space-y-2">
          {ourRows.map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-1 text-muted-2 text-xs font-mono">#{i + 1}</div>
              <div className="col-span-6">
                <select
                  value={row.player_id}
                  onChange={(e) => updateOurRow(i, 'player_id', e.target.value)}
                  className={inputClass}
                >
                  <option value="">— select player —</option>
                  {rosterPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-5">
                <select
                  value={row.agent}
                  onChange={(e) => updateOurRow(i, 'agent', e.target.value)}
                  className={inputClass}
                >
                  <option value="">— select agent —</option>
                  {AGENTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Opp agents */}
      <section className="bg-surface-2 rounded-xl p-5">
        <h2 className="text-gold text-sm uppercase tracking-wide mb-1">Opp Agents</h2>
        <p className="text-muted-2 text-xs mb-3">Optional — leave blank if hidden</p>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {oppAgents.map((agent, i) => (
            <div key={i}>
              <label className={labelClass}>Opp #{i + 1}</label>
              <select
                value={agent}
                onChange={(e) => updateOppAgent(i, e.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {AGENTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* Vibe + notes */}
      <section className="bg-surface-2 rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Vibe Tag</label>
          <input
            type="text"
            value={vibeTag}
            onChange={(e) => setVibeTag(e.target.value)}
            placeholder="locked in / sloppy / etc."
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </div>
      </section>

      {/* Submit */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm">
          {error && <span className="text-crimson">{error}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/app/matches')}
            className="px-4 py-2 text-sm text-muted-2 hover:text-fg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="px-5 py-2 bg-gold text-black font-semibold rounded-lg text-sm hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving…' : 'Create match'}
          </button>
        </div>
      </div>
    </form>
  )
}
