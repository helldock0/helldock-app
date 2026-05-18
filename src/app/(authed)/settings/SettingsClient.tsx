'use client'

import { useState } from 'react'

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

export default function SettingsClient({
  teamName,
  initialWebhook,
}: {
  teamName: string
  initialWebhook: string | null
}) {
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
      const res = await fetch('/api/settings/discord/test', {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTestState({
          kind: 'error',
          message: body?.error ?? `HTTP ${res.status}`,
        })
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
        setState({
          kind: 'error',
          message: body?.error ?? `HTTP ${res.status}`,
        })
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

  return (
    <main className="px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
          {teamName} · settings
        </p>
        <h1 className="text-3xl font-bold text-fg leading-tight">Team settings</h1>
      </div>

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
    </main>
  )
}
