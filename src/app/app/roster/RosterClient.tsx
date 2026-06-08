'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { RosterTransferTeam } from '@/lib/roster-transfer'
import type { PlayerAccountRow, PlayerRow } from './page'

type RosterStatus = 'main' | 'sub' | 'trial'

const STATUS_ORDER: RosterStatus[] = ['main', 'sub', 'trial']
const STATUS_LABEL: Record<RosterStatus, string> = {
  main: 'Main',
  sub: 'Sub',
  trial: 'Trial',
}
const STATUS_BADGE: Record<RosterStatus, string> = {
  main: 'bg-gold/15 text-gold border-gold/40',
  sub: 'bg-cyan-400/15 text-cyan-400 border-cyan-400/40',
  trial: 'bg-muted-2/15 text-muted-2 border-muted-2/40',
}

export default function RosterClient({
  teamId,
  teamName,
  teamSlug,
  players,
  transferTeams,
}: {
  teamId: string
  teamName: string
  teamSlug: string
  players: PlayerRow[]
  transferTeams: RosterTransferTeam[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<PlayerRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grouped: Record<RosterStatus, PlayerRow[]> = { main: [], sub: [], trial: [] }
  for (const p of players) {
    if (!p.is_active) continue
    grouped[p.roster_status].push(p)
  }
  const inactive = players.filter((p) => !p.is_active)

  function refresh() {
    router.refresh()
  }

  return (
    <main className="px-6 py-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
            {teamName} · roster
          </p>
          <h1 className="text-2xl font-bold text-fg leading-tight mt-1">Players</h1>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover transition-colors"
        >
          + Add player
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-crimson/40 bg-crimson/10 text-crimson text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {STATUS_ORDER.map((status) => (
          <section key={status}>
            <h2 className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">
              {STATUS_LABEL[status]} · {grouped[status].length}
              {status === 'trial' && (
                <span className="ml-2 normal-case tracking-normal text-muted-2/80">
                  (excluded from team aggregates)
                </span>
              )}
            </h2>
            {grouped[status].length === 0 ? (
              <p className="text-sm text-muted-2 italic">No players.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {grouped[status].map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="w-full text-left bg-surface-2 border border-line-strong/40 rounded-xl p-3 hover:border-gold/40 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-fg font-semibold">{p.display_name}</div>
                          <div className="text-xs text-muted-2 font-mono">
                            {p.riot_name && p.riot_tag
                              ? `${p.riot_name}#${p.riot_tag}`
                              : '(no riot id)'}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {p.main_role && (
                            <span className="text-2xs uppercase tracking-wider text-muted px-1.5 py-0.5 rounded border border-line-strong/40">
                              {p.main_role}
                            </span>
                          )}
                          <span
                            className={`text-2xs uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_BADGE[p.roster_status]}`}
                          >
                            {STATUS_LABEL[p.roster_status]}
                          </span>
                          {p.accounts.length > 1 && (
                            <span className="text-2xs text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-400/40 bg-cyan-400/10">
                              {p.accounts.length} accts
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-2xs text-muted-2 mt-1">
                        {p.match_count} match{p.match_count === 1 ? '' : 'es'}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {inactive.length > 0 && (
          <section>
            <h2 className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-2">
              Inactive · {inactive.length}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inactive.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="w-full text-left bg-surface-2/50 border border-line-strong/30 rounded-xl p-3 opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <div className="text-fg font-semibold">{p.display_name}</div>
                    <div className="text-xs text-muted-2 font-mono">
                      {p.riot_name && p.riot_tag ? `${p.riot_name}#${p.riot_tag}` : '(no riot id)'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {editing && (
        <EditPlayerModal
          player={editing}
          onClose={() => setEditing(null)}
          onError={setError}
          transferTeams={transferTeams}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
      {creating && (
        <CreatePlayerModal
          teamId={teamId}
          teamSlug={teamSlug}
          onClose={() => setCreating(false)}
          onError={setError}
          onSaved={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
    </main>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line-strong/60 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function EditPlayerModal({
  player,
  onClose,
  onSaved,
  onError,
  transferTeams,
}: {
  player: PlayerRow
  onClose: () => void
  onSaved: () => void
  onError: (msg: string | null) => void
  transferTeams: RosterTransferTeam[]
}) {
  const [displayName, setDisplayName] = useState(player.display_name)
  const [mainRole, setMainRole] = useState(player.main_role ?? '')
  const [mainAgent, setMainAgent] = useState(player.main_agent ?? '')
  const [status, setStatus] = useState<RosterStatus>(player.roster_status)
  const [riotName, setRiotName] = useState(player.riot_name ?? '')
  const [riotTag, setRiotTag] = useState(player.riot_tag ?? '')
  const [newAltName, setNewAltName] = useState('')
  const [newAltTag, setNewAltTag] = useState('')
  const [newAltLabel, setNewAltLabel] = useState('alt')
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<PlayerAccountRow[]>(player.accounts)

  async function save() {
    setSaving(true)
    onError(null)
    try {
      const res = await fetch(`/api/roster/players/${player.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          main_role: mainRole || null,
          main_agent: mainAgent || null,
          roster_status: status,
          riot_name: riotName,
          riot_tag: riotTag,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        onError(body?.error ?? `HTTP ${res.status}`)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function softDelete() {
    if (!confirm(`Mark ${player.display_name} as inactive? Historical matches stay intact.`)) return
    setSaving(true)
    onError(null)
    try {
      const res = await fetch(`/api/roster/players/${player.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(body?.error ?? `HTTP ${res.status}`)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function addAlt() {
    if (!newAltName.trim() || !newAltTag.trim()) return
    onError(null)
    const res = await fetch(`/api/roster/players/${player.id}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        riot_name: newAltName.trim(),
        riot_tag: newAltTag.trim(),
        label: newAltLabel.trim() || 'alt',
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      onError(body?.error ?? `HTTP ${res.status}`)
      return
    }
    setAccounts((prev) => [
      ...prev,
      {
        id: body.id,
        riot_name: newAltName.trim(),
        riot_tag: newAltTag.trim(),
        puuid: null,
        is_primary: false,
        label: newAltLabel.trim() || 'alt',
      },
    ])
    setNewAltName('')
    setNewAltTag('')
    setNewAltLabel('alt')
  }

  async function removeAlt(accountId: string) {
    onError(null)
    const res = await fetch(`/api/roster/accounts/${accountId}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      onError(body?.error ?? `HTTP ${res.status}`)
      return
    }
    setAccounts((prev) => prev.filter((a) => a.id !== accountId))
  }

  async function transferTo(team: RosterTransferTeam) {
    if (!confirm(`Move ${player.display_name} to ${team.name}? Match history stays linked.`)) return
    setSaving(true)
    onError(null)
    try {
      const res = await fetch(`/api/roster/players/${player.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_team_id: team.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(body?.error ?? `HTTP ${res.status}`)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const alts = accounts.filter((a) => !a.is_primary)

  return (
    <Modal onClose={onClose}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-fg">Edit {player.display_name}</h2>
        <button onClick={onClose} className="text-muted-2 hover:text-fg text-sm">
          Close
        </button>
      </div>

      <div className="space-y-3">
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="form-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary riot name">
            <input
              value={riotName}
              onChange={(e) => setRiotName(e.target.value)}
              className="form-input font-mono"
            />
          </Field>
          <Field label="Primary riot tag">
            <input
              value={riotTag}
              onChange={(e) => setRiotTag(e.target.value)}
              className="form-input font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Main role">
            <input
              value={mainRole}
              onChange={(e) => setMainRole(e.target.value)}
              placeholder="Controller"
              className="form-input"
            />
          </Field>
          <Field label="Main agent">
            <input
              value={mainAgent}
              onChange={(e) => setMainAgent(e.target.value)}
              placeholder="Viper"
              className="form-input"
            />
          </Field>
        </div>

        <Field label="Roster status">
          <div className="flex gap-2">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  status === s
                    ? STATUS_BADGE[s]
                    : 'border-line-strong/40 text-muted hover:text-fg'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-5 pt-4 border-t border-line-strong/40">
        <h3 className="text-2xs uppercase tracking-wider text-muted-2 mb-2">
          Alt accounts ({alts.length})
        </h3>
        {alts.length === 0 ? (
          <p className="text-xs text-muted-2 italic">No alt accounts yet.</p>
        ) : (
          <ul className="space-y-1.5 mb-3">
            {alts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between bg-surface-2 rounded-md px-3 py-1.5 border border-line-strong/40"
              >
                <div>
                  <span className="font-mono text-sm text-fg">
                    {a.riot_name}#{a.riot_tag}
                  </span>
                  {a.label && (
                    <span className="ml-2 text-2xs uppercase tracking-wider text-muted-2">
                      {a.label}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAlt(a.id)}
                  className="text-2xs text-muted-2 hover:text-crimson"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[1fr_120px_100px_auto] gap-2">
          <input
            value={newAltName}
            onChange={(e) => setNewAltName(e.target.value)}
            placeholder="riot name"
            className="form-input font-mono"
          />
          <input
            value={newAltTag}
            onChange={(e) => setNewAltTag(e.target.value)}
            placeholder="tag"
            className="form-input font-mono"
          />
          <input
            value={newAltLabel}
            onChange={(e) => setNewAltLabel(e.target.value)}
            placeholder="label"
            className="form-input"
          />
          <button
            type="button"
            onClick={addAlt}
            className="px-3 py-1.5 rounded-md bg-gold/15 border border-gold/40 text-gold text-sm font-semibold hover:bg-gold/25"
          >
            Add
          </button>
        </div>
      </div>

      {transferTeams.length > 0 && (
        <div className="mt-5 pt-4 border-t border-line-strong/40">
          <h3 className="text-2xs uppercase tracking-wider text-muted-2 mb-2">
            Move team
          </h3>
          <div className="flex flex-wrap gap-2">
            {transferTeams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => transferTo(team)}
                disabled={saving}
                className="px-3 py-1.5 rounded-md border border-cyan-400/40 bg-cyan-400/10 text-cyan-400 text-sm font-semibold hover:bg-cyan-400/20 disabled:opacity-50"
              >
                Move to {team.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-line-strong/40 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={softDelete}
          disabled={saving}
          className="px-3 py-1.5 rounded-md border border-line-strong/40 text-muted-2 text-sm hover:border-crimson hover:text-crimson disabled:opacity-50"
        >
          Mark inactive
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-line-strong/40 text-muted text-sm hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CreatePlayerModal({
  teamId,
  teamSlug,
  onClose,
  onSaved,
  onError,
}: {
  teamId: string
  teamSlug: string
  onClose: () => void
  onSaved: () => void
  onError: (msg: string | null) => void
}) {
  const [displayName, setDisplayName] = useState('')
  const [riotName, setRiotName] = useState('')
  const [riotTag, setRiotTag] = useState('')
  const [mainRole, setMainRole] = useState('')
  const [mainAgent, setMainAgent] = useState('')
  const [status, setStatus] = useState<RosterStatus>('main')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    onError(null)
    try {
      const res = await fetch('/api/roster/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          display_name: displayName,
          riot_name: riotName,
          riot_tag: riotTag,
          main_role: mainRole || null,
          main_agent: mainAgent || null,
          roster_status: status,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        onError(body?.error ?? `HTTP ${res.status}`)
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-bold text-fg">Add player to {teamSlug}</h2>
        <button onClick={onClose} className="text-muted-2 hover:text-fg text-sm">
          Close
        </button>
      </div>

      <div className="space-y-3">
        <Field label="Display name">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Yaki"
            className="form-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Riot name">
            <input
              value={riotName}
              onChange={(e) => setRiotName(e.target.value)}
              placeholder="Yaki"
              className="form-input font-mono"
            />
          </Field>
          <Field label="Riot tag">
            <input
              value={riotTag}
              onChange={(e) => setRiotTag(e.target.value)}
              placeholder="hers"
              className="form-input font-mono"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Main role">
            <input
              value={mainRole}
              onChange={(e) => setMainRole(e.target.value)}
              placeholder="Duelist"
              className="form-input"
            />
          </Field>
          <Field label="Main agent">
            <input
              value={mainAgent}
              onChange={(e) => setMainAgent(e.target.value)}
              placeholder="Jett"
              className="form-input"
            />
          </Field>
        </div>
        <Field label="Roster status">
          <div className="flex gap-2">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  status === s
                    ? STATUS_BADGE[s]
                    : 'border-line-strong/40 text-muted hover:text-fg'
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-5 pt-4 border-t border-line-strong/40 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-md border border-line-strong/40 text-muted text-sm hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !displayName || !riotName || !riotTag}
          className="px-4 py-1.5 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-wider text-muted-2 mb-1">{label}</span>
      {children}
    </label>
  )
}
