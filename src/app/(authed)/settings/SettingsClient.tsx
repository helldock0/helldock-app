'use client'

import { useState } from 'react'
import type { CaptureTokenRow, RosterPlayer } from './page'

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

type TestState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

type GenState =
  | { kind: 'idle' }
  | { kind: 'generating' }
  | { kind: 'shown'; plaintext: string; label: string; player: string }
  | { kind: 'error'; message: string }

export default function SettingsClient({
  teamName,
  initialWebhook,
  roster,
  initialTokens,
}: {
  teamName: string
  initialWebhook: string | null
  roster: RosterPlayer[]
  initialTokens: CaptureTokenRow[]
}) {
  // ── Discord webhook state (unchanged from prior version) ───────────────
  const [value, setValue] = useState(initialWebhook ?? '')
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [savedWebhook, setSavedWebhook] = useState<string | null>(initialWebhook)
  const [testState, setTestState] = useState<TestState>({ kind: 'idle' })

  async function save() {
    setState({ kind: 'saving' })
    try {
      const res = await fetch('/api/settings/discord', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value.trim() || null }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState({ kind: 'error', message: body?.error ?? `HTTP ${res.status}` })
        return
      }
      setState({ kind: 'saved' })
      setSavedWebhook(body?.discord_webhook_url ?? null)
      setTimeout(() => setState({ kind: 'idle' }), 1800)
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'save failed',
      })
    }
  }

  async function sendTest() {
    setTestState({ kind: 'sending' })
    try {
      const res = await fetch('/api/settings/discord/test', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTestState({ kind: 'error', message: body?.error ?? `HTTP ${res.status}` })
        return
      }
      setTestState({ kind: 'sent' })
      setTimeout(() => setTestState({ kind: 'idle' }), 2500)
    } catch (e) {
      setTestState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'test failed',
      })
    }
  }

  async function clear() {
    setValue('')
    setState({ kind: 'saving' })
    try {
      const res = await fetch('/api/settings/discord', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setState({ kind: 'error', message: body?.error ?? `HTTP ${res.status}` })
        return
      }
      setState({ kind: 'saved' })
      setSavedWebhook(null)
      setTimeout(() => setState({ kind: 'idle' }), 1800)
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'clear failed',
      })
    }
  }

  // ── Capture tokens state ─────────────────────────────────────────────
  const [tokens, setTokens] = useState<CaptureTokenRow[]>(initialTokens)
  const [genState, setGenState] = useState<GenState>({ kind: 'idle' })
  const [newLabel, setNewLabel] = useState('')
  const [newPlayer, setNewPlayer] = useState(roster[0]?.id ?? '')
  const [copied, setCopied] = useState(false)

  async function generate() {
    if (!newLabel.trim() || !newPlayer) {
      setGenState({ kind: 'error', message: 'label + player required' })
      return
    }
    setGenState({ kind: 'generating' })
    try {
      const res = await fetch('/api/settings/capture-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), playerId: newPlayer }),
      })
      const body = await res.json()
      if (!res.ok) {
        setGenState({ kind: 'error', message: body?.error ?? `HTTP ${res.status}` })
        return
      }
      setGenState({
        kind: 'shown',
        plaintext: body.plaintext,
        label: body.label,
        player: body.player_name,
      })
      // Prepend new token to the list (without the plaintext — it's never stored here)
      setTokens((prev) => [
        {
          id: body.id,
          label: body.label,
          created_at: body.created_at,
          last_used_at: null,
          revoked_at: null,
          player_id: newPlayer,
          player_name: body.player_name,
        },
        ...prev,
      ])
      setNewLabel('')
    } catch (e) {
      setGenState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'generate failed',
      })
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this token? The tray agent using it will stop working.')) return
    const res = await fetch(`/api/settings/capture-tokens/${id}`, { method: 'DELETE' })
    if (!res.ok) return
    setTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, revoked_at: new Date().toISOString() } : t))
    )
  }

  async function copyPlaintext(plaintext: string) {
    try {
      await navigator.clipboard.writeText(plaintext)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available; user can select+copy manually
    }
  }

  function dismissPlaintext() {
    setGenState({ kind: 'idle' })
    setCopied(false)
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <main className="px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
          {teamName} · settings
        </p>
        <h1 className="text-3xl font-bold text-fg leading-tight">Team settings</h1>
      </div>

      {/* Discord webhook section */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-5">
        <h2 className="text-lg font-semibold text-fg mb-1">Discord webhook</h2>
        <p className="text-sm text-muted-2 mb-4">
          Paste a Discord channel webhook URL here. Every imported or manually
          created match will post a summary embed to that channel. Failures are
          silent — the match still saves.
        </p>

        <label
          htmlFor="webhook"
          className="block text-2xs uppercase tracking-wider text-muted-2 mb-1"
        >
          Webhook URL
        </label>
        <input
          id="webhook"
          type="url"
          inputMode="url"
          value={value}
          placeholder="https://discord.com/api/webhooks/..."
          onChange={(e) => setValue(e.target.value)}
          className="w-full bg-surface border border-line-strong rounded-md px-3 py-2 text-sm text-fg font-mono placeholder:text-muted-2 focus:outline-none focus:border-gold"
        />

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={save}
            disabled={state.kind === 'saving'}
            className="px-4 py-2 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {state.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
          {savedWebhook && (
            <button
              type="button"
              onClick={sendTest}
              disabled={testState.kind === 'sending'}
              className="px-4 py-2 rounded-md border border-gold/50 bg-gold/10 text-gold font-semibold text-sm hover:bg-gold/20 transition-colors disabled:opacity-50"
              title="Post a sample embed to the saved webhook"
            >
              {testState.kind === 'sending' ? 'Sending…' : '🎯 Send test'}
            </button>
          )}
          {savedWebhook && (
            <button
              type="button"
              onClick={clear}
              disabled={state.kind === 'saving'}
              className="px-4 py-2 rounded-md border border-line-strong/60 text-muted text-sm hover:border-crimson hover:text-crimson transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          )}
          {state.kind === 'saved' && (
            <span className="text-2xs text-win-green">✓ saved</span>
          )}
          {state.kind === 'error' && (
            <span className="text-2xs text-crimson">✗ {state.message}</span>
          )}
          {testState.kind === 'sent' && (
            <span className="text-2xs text-win-green">
              ✓ test sent — check Discord
            </span>
          )}
          {testState.kind === 'error' && (
            <span className="text-2xs text-crimson">✗ {testState.message}</span>
          )}
        </div>

        <details className="mt-5 text-xs text-muted-2">
          <summary className="cursor-pointer hover:text-muted">
            How to get a webhook URL
          </summary>
          <ol className="mt-2 ml-5 list-decimal space-y-1 leading-relaxed">
            <li>Open your Discord server → channel settings → Integrations</li>
            <li>Webhooks → New Webhook</li>
            <li>Name it (e.g. &quot;Helldock&quot;), copy the URL</li>
            <li>Paste it above and click Save</li>
          </ol>
        </details>
      </section>

      {/* Capture tokens section */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-5">
        <h2 className="text-lg font-semibold text-fg mb-1">Capture tokens</h2>
        <p className="text-sm text-muted-2 mb-4">
          Bearer tokens for the helldock-capture tray agent — used to ingest
          custom games where the host enabled &quot;Hide Match History&quot;.
          Each teammate running the agent on their PC needs their own token.
          Plaintext is shown <strong className="text-fg">once</strong>; if lost,
          revoke + regenerate.
        </p>

        {/* Generate-token form */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 mb-4">
          <input
            type="text"
            value={newLabel}
            placeholder="Label (e.g. 'James gaming PC')"
            onChange={(e) => setNewLabel(e.target.value)}
            className="bg-surface border border-line-strong rounded-md px-3 py-2 text-sm text-fg placeholder:text-muted-2 focus:outline-none focus:border-gold"
          />
          <select
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
            className="bg-surface border border-line-strong rounded-md px-3 py-2 text-sm text-fg focus:outline-none focus:border-gold"
          >
            {roster.length === 0 ? (
              <option value="">No players in team</option>
            ) : (
              roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={generate}
            disabled={genState.kind === 'generating' || roster.length === 0}
            className="px-4 py-2 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {genState.kind === 'generating' ? 'Generating…' : '+ Generate token'}
          </button>
        </div>

        {/* One-shot plaintext display */}
        {genState.kind === 'shown' && (
          <div className="mb-4 rounded-md border border-gold/50 bg-gold/5 p-4">
            <p className="text-2xs uppercase tracking-wider text-gold mb-2">
              ⚠ Copy this token now — it won&apos;t be shown again
            </p>
            <p className="text-xs text-muted mb-2">
              {genState.label} · {genState.player}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-surface border border-line-strong rounded-md px-3 py-2 text-xs text-fg font-mono break-all">
                {genState.plaintext}
              </code>
              <button
                type="button"
                onClick={() => copyPlaintext(genState.plaintext)}
                className="px-3 py-2 rounded-md border border-gold/50 bg-gold/10 text-gold font-semibold text-xs hover:bg-gold/20 transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button
                type="button"
                onClick={dismissPlaintext}
                className="px-3 py-2 rounded-md border border-line-strong/60 text-muted text-xs hover:border-crimson hover:text-crimson transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        {genState.kind === 'error' && (
          <p className="mb-4 text-2xs text-crimson">✗ {genState.message}</p>
        )}

        {/* Token list */}
        {tokens.length === 0 ? (
          <p className="text-2xs text-muted-2 italic">No tokens yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line-strong/40">
                  <th className="text-left py-2 pr-3 font-medium">Label</th>
                  <th className="text-left py-2 pr-3 font-medium">Player</th>
                  <th className="text-left py-2 pr-3 font-medium">Last used</th>
                  <th className="text-left py-2 pr-3 font-medium">Status</th>
                  <th className="text-right py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => {
                  const isRevoked = !!t.revoked_at
                  return (
                    <tr key={t.id} className="border-b border-line-strong/20">
                      <td className="py-2 pr-3 text-fg">{t.label}</td>
                      <td className="py-2 pr-3 text-muted">{t.player_name}</td>
                      <td className="py-2 pr-3 text-muted tnum">
                        {t.last_used_at
                          ? new Date(t.last_used_at).toLocaleString()
                          : 'never'}
                      </td>
                      <td className="py-2 pr-3">
                        {isRevoked ? (
                          <span className="text-crimson">revoked</span>
                        ) : (
                          <span className="text-win-green">active</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {!isRevoked && (
                          <button
                            type="button"
                            onClick={() => revoke(t.id)}
                            className="px-2 py-1 rounded-md border border-line-strong/60 text-muted text-2xs hover:border-crimson hover:text-crimson transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-5 text-xs text-muted-2">
          <summary className="cursor-pointer hover:text-muted">
            How to install the tray agent
          </summary>
          <ol className="mt-2 ml-5 list-decimal space-y-1 leading-relaxed">
            <li>Download <code className="font-mono">helldock-capture.exe</code> from the team Drive folder</li>
            <li>Run it — a tray icon appears (gray = idle, gold = watching, crimson = uploading)</li>
            <li>Right-click → Settings → paste this token → pick your team → Send test ping</li>
            <li>Toggle &quot;Launch at startup&quot; so it auto-runs when you log in</li>
            <li>That&apos;s it — every custom you play gets captured ~3 min after the match ends</li>
          </ol>
        </details>
      </section>
    </main>
  )
}
