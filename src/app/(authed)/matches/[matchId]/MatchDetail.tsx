'use client'

import React, { useState, useRef, useCallback } from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────

type Match = {
  id: string
  match_id_helldock: string
  match_date: string
  match_type: string | null
  session_num: number | null
  opponent_name: string | null
  map_name: string | null
  pick: string | null
  start_side: string | null
  our_score: number | null
  opp_score: number | null
  result: string | null
  our_agents: string[] | null
  opp_agents: string[] | null
  rounds_played: number | null
  scrim_format: string | null
  vibe_tag: string | null
  coach_grade: string | null
  vod_link: string | null
  notes: string | null
  is_manual_entry: boolean
  imported_at: string | null
}

type Round = {
  id: string
  round_num: number
  half: string | null
  side: string | null
  our_econ: number | null
  their_econ: number | null
  round_type: string | null
  site: string | null
  outcome: string | null
  first_blood: string | null
  fb_player: string | null
  fb_weapon: string | null
  was_traded: boolean | null
  planter: string | null
  defuser: string | null
  clutch_type: string | null
  clutch_player: string | null
  mvp: string | null
  note: string | null
}

type MatchPlayer = {
  id: string
  player: { display_name: string } | null
  agent: string | null
  role: string | null
  k: number | null
  d: number | null
  a: number | null
  acs: number | null
  econ: number | null
  plants: number | null
  defuses: number | null
  fk: number | null
  fd: number | null
  plus_minus: number | null
  rating: number | null
  notes: string | null
}

type OppPlayer = {
  id: string
  opp_player_name: string | null
  riot_id_full: string | null
  agent: string | null
  k: number | null
  d: number | null
  a: number | null
  acs: number | null
  fb: number | null
  plants: number | null
  defuses: number | null
  notes: string | null
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Re-fetch from Henrik ───────────────────────────────────────────────────

function RehydrateButton({
  matchUuid,
  onSuccess,
}: {
  matchUuid: string
  onSuccess: () => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  async function handleClick() {
    if (state === 'loading') return
    setState('loading')
    const res = await fetch(`/api/matches/${matchUuid}/rehydrate`, { method: 'POST' })
    if (!res.ok) {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
      return
    }
    setState('idle')
    onSuccess()
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      title="Re-fetch this match from HenrikDev (populates plants, defuses, FK/FD, multikills, clutches)"
      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
        state === 'error'
          ? 'bg-[#DC143C] text-white'
          : 'bg-[#3C3C44] text-[#6B7280] hover:text-[#FFD700] disabled:opacity-50'
      }`}
    >
      {state === 'loading' ? 'fetching…' : state === 'error' ? 'failed' : '↻ rehydrate'}
    </button>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined || val === '') return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  return String(val)
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

async function patchApi(url: string, body: object): Promise<boolean> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok
}

function num(v: string): number | null { return v === '' ? null : Number(v) }
function str(v: string): string | null { return v === '' ? null : v }

// ── Read-only components ───────────────────────────────────────────────────

function Field({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[#6B7280] text-xs uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-white text-sm">{value ?? '—'}</p>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-[#2C2C32] rounded-xl p-8 text-center text-[#6B7280] text-sm">
      no {label} logged yet
    </div>
  )
}

// ── Edit input primitives ──────────────────────────────────────────────────

const iCls = 'bg-[#1B1B1F] border border-[#FFD700]/50 rounded px-2 py-1 text-white text-sm w-full focus:outline-none focus:border-[#FFD700] placeholder-[#6B7280]'
const siCls = 'bg-[#1B1B1F] border border-[#FFD700]/40 rounded px-1 py-0.5 text-xs text-white w-full focus:outline-none focus:border-[#FFD700] min-w-0'

function EI({ value, onChange, type = 'text', placeholder }: {
  value: string | number | null; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={iCls} />
}

function ES({ value, onChange, opts }: {
  value: string | null; onChange: (v: string) => void; opts: [string, string][]
}) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={iCls + ' cursor-pointer'}>
      <option value="">—</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

function ET({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={3} className={iCls + ' resize-none'} />
}

function SI({ value, onChange, type = 'text' }: {
  value: string | number | null; onChange: (v: string) => void; type?: string
}) {
  return <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} className={siCls} />
}

function SS({ value, onChange, opts }: {
  value: string | null; onChange: (v: string) => void; opts: [string, string][]
}) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={siCls + ' cursor-pointer'}>
      <option value="">—</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

// Label + child wrapper for overview grid
function EF({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <p className="text-[#6B7280] text-xs uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  )
}

// ── Overview Tab ───────────────────────────────────────────────────────────

function OverviewTab({ match, editMode, onMatchChange }: {
  match: Match
  editMode: boolean
  onMatchChange: (field: keyof Match, value: unknown) => void
}) {
  const [ourAgentsRaw, setOurAgentsRaw] = useState(match.our_agents?.join(', ') ?? '')
  const [oppAgentsRaw, setOppAgentsRaw] = useState(match.opp_agents?.join(', ') ?? '')

  if (!editMode) {
    return (
      <div className="bg-[#2C2C32] rounded-xl p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Field label="Match ID" value={match.match_id_helldock} />
          <Field label="Date" value={formatDate(match.match_date)} />
          <Field label="Type" value={match.match_type} />
          <Field label="Session #" value={match.session_num} />
          <Field label="Opponent" value={match.opponent_name} />
          <Field label="Map" value={match.map_name} />
          <Field label="Pick" value={match.pick} />
          <Field label="Start Side" value={match.start_side} />
          <Field label="Our Score" value={match.our_score} />
          <Field label="Opp Score" value={match.opp_score} />
          <Field label="Rounds Played" value={match.rounds_played} />
          <Field label="Format" value={match.scrim_format} />
          <Field label="Vibe" value={match.vibe_tag} />
          <Field label="Coach Grade" value={match.coach_grade} />
          <Field label="Our Agents" value={match.our_agents?.join(', ') || null} wide />
          <Field label="Opp Agents" value={match.opp_agents?.join(', ') || null} wide />
          {match.vod_link && (
            <div className="col-span-2">
              <p className="text-[#6B7280] text-xs uppercase tracking-wide mb-0.5">VOD</p>
              <a href={match.vod_link} target="_blank" rel="noopener noreferrer" className="text-[#FFD700] text-sm hover:underline break-all">
                {match.vod_link}
              </a>
            </div>
          )}
          {match.notes && <Field label="Notes" value={match.notes} wide />}
          <Field label="Entry" value={match.is_manual_entry ? 'Manual' : 'Auto-imported'} />
          <Field label="Imported" value={match.imported_at ? formatDate(match.imported_at.split('T')[0]) : null} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#2C2C32] rounded-xl p-6">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <Field label="Match ID" value={match.match_id_helldock} />
        <EF label="Date">
          <EI type="date" value={match.match_date} onChange={v => onMatchChange('match_date', v || match.match_date)} />
        </EF>
        <EF label="Type">
          <EI value={match.match_type} onChange={v => onMatchChange('match_type', str(v))} placeholder="Scrim / Premier" />
        </EF>
        <EF label="Session #">
          <EI type="number" value={match.session_num} onChange={v => onMatchChange('session_num', num(v))} />
        </EF>
        <EF label="Opponent">
          <EI value={match.opponent_name} onChange={v => onMatchChange('opponent_name', str(v))} placeholder="Team name" />
        </EF>
        <EF label="Map">
          <EI value={match.map_name} onChange={v => onMatchChange('map_name', str(v))} placeholder="Bind, Haven…" />
        </EF>
        <EF label="Pick">
          <ES value={match.pick} onChange={v => onMatchChange('pick', str(v))}
            opts={[['Pick', 'Pick'], ['Ban', 'Ban'], ['Decider', 'Decider'], ['N/A', 'N/A']]} />
        </EF>
        <EF label="Start Side">
          <ES value={match.start_side} onChange={v => onMatchChange('start_side', str(v))}
            opts={[['Attack', 'Attack'], ['Defense', 'Defense']]} />
        </EF>
        <EF label="Our Score">
          <EI type="number" value={match.our_score} onChange={v => onMatchChange('our_score', num(v))} />
        </EF>
        <EF label="Opp Score">
          <EI type="number" value={match.opp_score} onChange={v => onMatchChange('opp_score', num(v))} />
        </EF>
        <EF label="Rounds Played">
          <EI type="number" value={match.rounds_played} onChange={v => onMatchChange('rounds_played', num(v))} />
        </EF>
        <EF label="Format">
          <EI value={match.scrim_format} onChange={v => onMatchChange('scrim_format', str(v))} placeholder="BO1, BO3…" />
        </EF>
        <EF label="Vibe">
          <EI value={match.vibe_tag} onChange={v => onMatchChange('vibe_tag', str(v))} placeholder="Tilted, Focused…" />
        </EF>
        <EF label="Coach Grade">
          <EI value={match.coach_grade} onChange={v => onMatchChange('coach_grade', str(v))} placeholder="A, B+…" />
        </EF>
        <EF label="Our Agents" wide>
          <EI
            value={ourAgentsRaw}
            onChange={v => {
              setOurAgentsRaw(v)
              onMatchChange('our_agents', v ? v.split(',').map(s => s.trim()).filter(Boolean) : null)
            }}
            placeholder="Jett, Omen, Killjoy…"
          />
        </EF>
        <EF label="Opp Agents" wide>
          <EI
            value={oppAgentsRaw}
            onChange={v => {
              setOppAgentsRaw(v)
              onMatchChange('opp_agents', v ? v.split(',').map(s => s.trim()).filter(Boolean) : null)
            }}
            placeholder="Neon, Brimstone…"
          />
        </EF>
        <EF label="VOD Link" wide>
          <EI value={match.vod_link} onChange={v => onMatchChange('vod_link', str(v))} placeholder="https://…" />
        </EF>
        <EF label="Notes" wide>
          <ET value={match.notes} onChange={v => onMatchChange('notes', str(v))} />
        </EF>
        <Field label="Entry" value={match.is_manual_entry ? 'Manual' : 'Auto-imported'} />
        <Field label="Imported" value={match.imported_at ? formatDate(match.imported_at.split('T')[0]) : null} />
      </div>
    </div>
  )
}

// ── Rounds Tab ─────────────────────────────────────────────────────────────

const OUTCOME_OPTS: [string, string][] = [['W', 'W'], ['L', 'L']]
const FB_OPTS: [string, string][] = [['us', 'us'], ['them', 'them']]

function RoundsTab({ rounds, editMode, onRoundChange }: {
  rounds: Round[]
  editMode: boolean
  onRoundChange: (id: string, field: string, value: unknown) => void
}) {
  if (rounds.length === 0) return <EmptyState label="rounds" />

  return (
    <div className="bg-[#2C2C32] rounded-xl overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-[#3C3C44] text-[#6B7280] uppercase tracking-wide">
            {['#', 'Half', 'Side', 'Type', 'Site', 'Our', 'Their', 'Out', 'FB', 'FB Player', 'Planter', 'Defuser', 'Clutch', 'MVP', 'Note'].map(h => (
              <th key={h} className="text-left px-3 py-2 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rounds.map((r, i) => (
            <tr key={r.id} className={`${i % 2 === 0 ? 'bg-[#2C2C32]' : 'bg-[#28282E]'} hover:bg-[#35353C]`}>
              <td className="px-3 py-1.5 font-mono text-[#6B7280]">{r.round_num}</td>
              <td className="px-3 py-1.5">{fmt(r.half)}</td>
              <td className="px-3 py-1.5">{fmt(r.side)}</td>
              <td className="px-3 py-1.5">{fmt(r.round_type)}</td>
              <td className="px-3 py-1.5 w-20">
                {editMode
                  ? <SI value={r.site} onChange={v => onRoundChange(r.id, 'site', str(v))} />
                  : fmt(r.site)}
              </td>
              <td className="px-3 py-1.5 font-mono">{fmt(r.our_econ)}</td>
              <td className="px-3 py-1.5 font-mono">{fmt(r.their_econ)}</td>
              <td className="px-3 py-1.5 w-14">
                {editMode
                  ? <SS value={r.outcome} onChange={v => onRoundChange(r.id, 'outcome', str(v))} opts={OUTCOME_OPTS} />
                  : r.outcome === 'W'
                    ? <span className="text-green-400 font-bold">W</span>
                    : r.outcome === 'L'
                    ? <span className="text-[#DC143C] font-bold">L</span>
                    : '—'}
              </td>
              <td className="px-3 py-1.5 w-16">
                {editMode
                  ? <SS value={r.first_blood} onChange={v => onRoundChange(r.id, 'first_blood', str(v))} opts={FB_OPTS} />
                  : fmt(r.first_blood)}
              </td>
              <td className="px-3 py-1.5 w-24">
                {editMode
                  ? <SI value={r.fb_player} onChange={v => onRoundChange(r.id, 'fb_player', str(v))} />
                  : fmt(r.fb_player)}
              </td>
              <td className="px-3 py-1.5 w-24">
                {editMode
                  ? <SI value={r.planter} onChange={v => onRoundChange(r.id, 'planter', str(v))} />
                  : fmt(r.planter)}
              </td>
              <td className="px-3 py-1.5 w-24">
                {editMode
                  ? <SI value={r.defuser} onChange={v => onRoundChange(r.id, 'defuser', str(v))} />
                  : fmt(r.defuser)}
              </td>
              <td className="px-3 py-1.5">{fmt(r.clutch_type)}</td>
              <td className="px-3 py-1.5">{fmt(r.mvp)}</td>
              <td className="px-3 py-1.5 w-32">
                {editMode
                  ? <SI value={r.note} onChange={v => onRoundChange(r.id, 'note', str(v))} />
                  : <span className="text-[#6B7280] truncate block max-w-[128px]">{fmt(r.note)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Players Tab ────────────────────────────────────────────────────────────

function PlayersTab({ players, editMode, onPlayerChange }: {
  players: MatchPlayer[]
  editMode: boolean
  onPlayerChange: (id: string, field: string, value: unknown) => void
}) {
  if (players.length === 0) return <EmptyState label="player stats" />

  return (
    <div className="bg-[#2C2C32] rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#3C3C44] text-[#6B7280] text-xs uppercase tracking-wide">
            {['Player', 'Agent', 'Role', 'K', 'D', 'A', 'ACS', '+/-', 'Plants', 'Defuses', 'Rating', 'Notes'].map(h => (
              <th key={h} className="text-left px-4 py-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.id} className={`${i !== players.length - 1 ? 'border-b border-[#3C3C44]' : ''} hover:bg-[#35353C]`}>
              <td className="px-4 py-2 font-medium text-[#FFD700]">{p.player?.display_name ?? '—'}</td>
              <td className="px-4 py-2">
                {editMode ? <SI value={p.agent} onChange={v => onPlayerChange(p.id, 'agent', str(v))} /> : fmt(p.agent)}
              </td>
              <td className="px-4 py-2 text-[#6B7280]">
                {editMode ? <SI value={p.role} onChange={v => onPlayerChange(p.id, 'role', str(v))} /> : fmt(p.role)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.k} onChange={v => onPlayerChange(p.id, 'k', num(v))} /> : fmt(p.k)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.d} onChange={v => onPlayerChange(p.id, 'd', num(v))} /> : fmt(p.d)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.a} onChange={v => onPlayerChange(p.id, 'a', num(v))} /> : fmt(p.a)}
              </td>
              <td className="px-4 py-2 font-mono font-semibold w-16">
                {editMode ? <SI type="number" value={p.acs} onChange={v => onPlayerChange(p.id, 'acs', num(v))} /> : fmt(p.acs)}
              </td>
              <td className={`px-4 py-2 font-mono w-16 ${!editMode ? ((p.plus_minus ?? 0) >= 0 ? 'text-green-400' : 'text-[#DC143C]') : ''}`}>
                {editMode
                  ? <SI type="number" value={p.plus_minus} onChange={v => onPlayerChange(p.id, 'plus_minus', num(v))} />
                  : p.plus_minus != null ? (p.plus_minus >= 0 ? `+${p.plus_minus}` : String(p.plus_minus)) : '—'}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.plants} onChange={v => onPlayerChange(p.id, 'plants', num(v))} /> : fmt(p.plants)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.defuses} onChange={v => onPlayerChange(p.id, 'defuses', num(v))} /> : fmt(p.defuses)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.rating} onChange={v => onPlayerChange(p.id, 'rating', num(v))} /> : fmt(p.rating)}
              </td>
              <td className="px-4 py-2 text-[#6B7280] text-xs w-36">
                {editMode
                  ? <SI value={p.notes} onChange={v => onPlayerChange(p.id, 'notes', str(v))} />
                  : <span className="truncate block max-w-[144px]">{fmt(p.notes)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Opp Players Tab ────────────────────────────────────────────────────────

function OppPlayersTab({ players, editMode, onOppPlayerChange }: {
  players: OppPlayer[]
  editMode: boolean
  onOppPlayerChange: (id: string, field: string, value: unknown) => void
}) {
  if (players.length === 0) return <EmptyState label="opp player stats" />

  return (
    <div className="bg-[#2C2C32] rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#3C3C44] text-[#6B7280] text-xs uppercase tracking-wide">
            {['Player', 'Riot ID', 'Agent', 'K', 'D', 'A', 'ACS', 'FB', 'Plants', 'Defuses', 'Notes'].map(h => (
              <th key={h} className="text-left px-4 py-3 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={p.id} className={`${i !== players.length - 1 ? 'border-b border-[#3C3C44]' : ''} hover:bg-[#35353C]`}>
              <td className="px-4 py-2 font-medium">
                {editMode ? <SI value={p.opp_player_name} onChange={v => onOppPlayerChange(p.id, 'opp_player_name', str(v))} /> : fmt(p.opp_player_name)}
              </td>
              <td className="px-4 py-2 font-mono text-xs text-[#6B7280]">
                {editMode ? <SI value={p.riot_id_full} onChange={v => onOppPlayerChange(p.id, 'riot_id_full', str(v))} /> : fmt(p.riot_id_full)}
              </td>
              <td className="px-4 py-2">
                {editMode ? <SI value={p.agent} onChange={v => onOppPlayerChange(p.id, 'agent', str(v))} /> : fmt(p.agent)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.k} onChange={v => onOppPlayerChange(p.id, 'k', num(v))} /> : fmt(p.k)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.d} onChange={v => onOppPlayerChange(p.id, 'd', num(v))} /> : fmt(p.d)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.a} onChange={v => onOppPlayerChange(p.id, 'a', num(v))} /> : fmt(p.a)}
              </td>
              <td className="px-4 py-2 font-mono font-semibold w-16">
                {editMode ? <SI type="number" value={p.acs} onChange={v => onOppPlayerChange(p.id, 'acs', num(v))} /> : fmt(p.acs)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.fb} onChange={v => onOppPlayerChange(p.id, 'fb', num(v))} /> : fmt(p.fb)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.plants} onChange={v => onOppPlayerChange(p.id, 'plants', num(v))} /> : fmt(p.plants)}
              </td>
              <td className="px-4 py-2 font-mono w-16">
                {editMode ? <SI type="number" value={p.defuses} onChange={v => onOppPlayerChange(p.id, 'defuses', num(v))} /> : fmt(p.defuses)}
              </td>
              <td className="px-4 py-2 text-[#6B7280] text-xs w-36">
                {editMode
                  ? <SI value={p.notes} onChange={v => onOppPlayerChange(p.id, 'notes', str(v))} />
                  : <span className="truncate block max-w-[144px]">{fmt(p.notes)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Rounds', 'Players', 'Opp Players'] as const
type Tab = (typeof TABS)[number]

export default function MatchDetail({
  match: initialMatch,
  rounds: initialRounds,
  matchPlayers: initialMatchPlayers,
  oppPlayers: initialOppPlayers,
  initialEdit = false,
}: {
  match: Match
  rounds: Round[]
  matchPlayers: MatchPlayer[]
  oppPlayers: OppPlayer[]
  initialEdit?: boolean
}) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [editMode, setEditMode] = useState(initialEdit)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const [localMatch, setLocalMatch] = useState(initialMatch)
  const [localRounds, setLocalRounds] = useState(initialRounds)
  const [localMatchPlayers, setLocalMatchPlayers] = useState(initialMatchPlayers)
  const [localOppPlayers, setLocalOppPlayers] = useState(initialOppPlayers)

  // Per-entity pending updates + debounce timers
  const matchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingMatch = useRef<Record<string, unknown>>({})

  const roundTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingRounds = useRef<Record<string, Record<string, unknown>>>({})

  const mpTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingMp = useRef<Record<string, Record<string, unknown>>>({})

  const oppTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingOpp = useRef<Record<string, Record<string, unknown>>>({})

  const onSaved = useCallback(() => {
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 1500)
  }, [])

  const onError = useCallback(() => {
    setSaveStatus('error')
    setTimeout(() => setSaveStatus(s => s === 'error' ? 'idle' : s), 3000)
  }, [])

  const handleMatchChange = useCallback((field: keyof Match, value: unknown) => {
    setLocalMatch(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'our_score' || field === 'opp_score') {
        const os = field === 'our_score' ? (value as number | null) : prev.our_score
        const ops = field === 'opp_score' ? (value as number | null) : prev.opp_score
        next.result = os != null && ops != null
          ? os > ops ? 'W' : os < ops ? 'L' : null
          : null
      }
      return next
    })
    pendingMatch.current[field as string] = value
    if (matchTimer.current) clearTimeout(matchTimer.current)
    matchTimer.current = setTimeout(async () => {
      const updates = { ...pendingMatch.current }
      pendingMatch.current = {}
      setSaveStatus('saving')
      const ok = await patchApi(`/api/matches/${initialMatch.id}`, updates)
      if (ok) onSaved(); else onError()
    }, 450)
  }, [initialMatch.id, onSaved, onError])

  const handleRoundChange = useCallback((id: string, field: string, value: unknown) => {
    setLocalRounds(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    if (!pendingRounds.current[id]) pendingRounds.current[id] = {}
    pendingRounds.current[id][field] = value
    if (roundTimers.current[id]) clearTimeout(roundTimers.current[id])
    roundTimers.current[id] = setTimeout(async () => {
      const updates = { ...pendingRounds.current[id] }
      delete pendingRounds.current[id]
      setSaveStatus('saving')
      const ok = await patchApi(`/api/rounds/${id}`, updates)
      if (ok) onSaved(); else onError()
    }, 450)
  }, [onSaved, onError])

  const handleMpChange = useCallback((id: string, field: string, value: unknown) => {
    setLocalMatchPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    if (!pendingMp.current[id]) pendingMp.current[id] = {}
    pendingMp.current[id][field] = value
    if (mpTimers.current[id]) clearTimeout(mpTimers.current[id])
    mpTimers.current[id] = setTimeout(async () => {
      const updates = { ...pendingMp.current[id] }
      delete pendingMp.current[id]
      setSaveStatus('saving')
      const ok = await patchApi(`/api/match-players/${id}`, updates)
      if (ok) onSaved(); else onError()
    }, 450)
  }, [onSaved, onError])

  const handleOppChange = useCallback((id: string, field: string, value: unknown) => {
    setLocalOppPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
    if (!pendingOpp.current[id]) pendingOpp.current[id] = {}
    pendingOpp.current[id][field] = value
    if (oppTimers.current[id]) clearTimeout(oppTimers.current[id])
    oppTimers.current[id] = setTimeout(async () => {
      const updates = { ...pendingOpp.current[id] }
      delete pendingOpp.current[id]
      setSaveStatus('saving')
      const ok = await patchApi(`/api/opp-players/${id}`, updates)
      if (ok) onSaved(); else onError()
    }, 450)
  }, [onSaved, onError])

  const isWin = localMatch.result === 'W'
  const isLoss = localMatch.result === 'L'

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <Link href="/matches" className="text-[#6B7280] text-sm hover:text-white transition-colors mb-4 inline-block">
        ← match log
      </Link>

      {/* Header card */}
      <div className="bg-[#2C2C32] rounded-xl p-6 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-[#6B7280] text-sm">{localMatch.match_id_helldock}</span>
            {localMatch.is_manual_entry && (
              <span className="text-xs bg-[#3C3C44] text-[#6B7280] px-2 py-0.5 rounded">manual</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">
            {localMatch.map_name ?? 'Unknown Map'}
          </h1>
          <p className="text-[#6B7280]">
            {localMatch.opponent_name ?? 'Unknown Opponent'}
            {localMatch.match_type && <span className="ml-2">· {localMatch.match_type}</span>}
            {localMatch.match_date && <span className="ml-2">· {formatDate(localMatch.match_date)}</span>}
          </p>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && <span className="text-xs text-[#6B7280]">saving…</span>}
            {saveStatus === 'saved' && <span className="text-xs text-green-400">saved</span>}
            {saveStatus === 'error' && <span className="text-xs text-[#DC143C]">error saving</span>}
            {!localMatch.is_manual_entry && (
              <RehydrateButton
                matchUuid={localMatch.id}
                onSuccess={() => window.location.reload()}
              />
            )}
            <button
              onClick={() => setEditMode(e => !e)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                editMode
                  ? 'bg-[#FFD700] text-[#1B1B1F]'
                  : 'bg-[#3C3C44] text-[#6B7280] hover:text-white'
              }`}
            >
              {editMode ? 'editing' : 'edit'}
            </button>
          </div>
          <div className={`text-5xl font-bold tabular-nums ${
            isWin ? 'text-[#FFD700]' : isLoss ? 'text-[#DC143C]' : 'text-white'
          }`}>
            {localMatch.our_score != null && localMatch.opp_score != null
              ? `${localMatch.our_score}–${localMatch.opp_score}`
              : '—'}
          </div>
          <div className={`text-lg font-bold ${
            isWin ? 'text-[#FFD700]' : isLoss ? 'text-[#DC143C]' : 'text-[#6B7280]'
          }`}>
            {localMatch.result ?? '—'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-[#2C2C32] rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-[#FFD700] text-[#1B1B1F]' : 'text-[#6B7280] hover:text-white'
            }`}
          >
            {t}
            {t === 'Rounds' && localRounds.length > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{localRounds.length}</span>
            )}
            {t === 'Players' && localMatchPlayers.length > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{localMatchPlayers.length}</span>
            )}
            {t === 'Opp Players' && localOppPlayers.length > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{localOppPlayers.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && (
        <OverviewTab match={localMatch} editMode={editMode} onMatchChange={handleMatchChange} />
      )}
      {tab === 'Rounds' && (
        <RoundsTab rounds={localRounds} editMode={editMode} onRoundChange={handleRoundChange} />
      )}
      {tab === 'Players' && (
        <PlayersTab players={localMatchPlayers} editMode={editMode} onPlayerChange={handleMpChange} />
      )}
      {tab === 'Opp Players' && (
        <OppPlayersTab players={localOppPlayers} editMode={editMode} onOppPlayerChange={handleOppChange} />
      )}
    </div>
  )
}
