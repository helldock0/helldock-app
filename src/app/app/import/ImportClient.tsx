'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MatchPreview } from '@/app/api/import/fetch/route'

type LoadState = 'idle' | 'fetching' | 'saving' | 'rehydrating'

type RehydratableMatch = { id: string; match_id_helldock: string }

const hideInternalKey = (slug: string) => `helldock_import_hide_internal_${slug}`

function loadHideInternal(slug: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(hideInternalKey(slug)) === '1'
  } catch {
    return false
  }
}

function saveHideInternal(slug: string, value: boolean) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(hideInternalKey(slug), value ? '1' : '0')
  } catch {
    // ignore
  }
}

type CachedFetch = { previews: MatchPreview[]; fetchedAt: number }

const cacheKey = (slug: string) => `helldock_import_${slug}`

function loadCache(slug: string): CachedFetch | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cacheKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedFetch
    if (!Array.isArray(parsed.previews)) return null
    return parsed
  } catch {
    return null
  }
}

function saveCache(slug: string, previews: MatchPreview[]) {
  if (typeof window === 'undefined') return
  try {
    const payload: CachedFetch = { previews, fetchedAt: Date.now() }
    window.localStorage.setItem(cacheKey(slug), JSON.stringify(payload))
  } catch {
    // ignore quota / serialize errors
  }
}

function clearCache(slug: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(cacheKey(slug)) } catch {}
}

function formatAge(ts: number | null): string {
  if (!ts) return ''
  const ms = Date.now() - ts
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function ResultBadge({ result }: { result: string }) {
  if (result === 'W') return <span className="text-win-green font-bold">W</span>
  if (result === 'L') return <span className="text-crimson font-bold">L</span>
  return <span className="text-muted-2">—</span>
}

export default function ImportClient({
  lockedTeamSlug,
  lockedTeamName,
  rehydratableMatches,
}: {
  lockedTeamSlug: string
  lockedTeamName: string
  rehydratableMatches: RehydratableMatch[]
}) {
  const router = useRouter()
  const [previews, setPreviews] = useState<MatchPreview[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ saved: number; duplicates: number; errors: unknown[] } | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [rehydrateProgress, setRehydrateProgress] = useState<{
    done: number
    total: number
    errors: number
  } | null>(null)
  const [hideInternal, setHideInternal] = useState<boolean>(false)
  const hydratedFor = useRef<string | null>(null)

  async function handleRehydrateAll() {
    if (rehydratableMatches.length === 0) return
    if (!confirm(
      `Re-fetch and update ${rehydratableMatches.length} match${rehydratableMatches.length !== 1 ? 'es' : ''} from Henrik V4? Manual fields (notes, scores) are preserved.`
    )) {
      return
    }

    setLoadState('rehydrating')
    setRehydrateProgress({ done: 0, total: rehydratableMatches.length, errors: 0 })

    let errors = 0
    for (let i = 0; i < rehydratableMatches.length; i++) {
      const m = rehydratableMatches[i]
      try {
        const res = await fetch(`/api/matches/${m.id}/rehydrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (!res.ok) errors++
      } catch {
        errors++
      }
      setRehydrateProgress({ done: i + 1, total: rehydratableMatches.length, errors })
    }

    setLoadState('idle')
    router.refresh()
  }

  // Hydrate per-team cache on mount + whenever team changes
  useEffect(() => {
    if (hydratedFor.current === lockedTeamSlug) return
    hydratedFor.current = lockedTeamSlug
    const cached = loadCache(lockedTeamSlug)
    if (cached) {
      setPreviews(cached.previews)
      setFetchedAt(cached.fetchedAt)
    } else {
      setPreviews([])
      setFetchedAt(null)
    }
    setSelected(new Set())
    setFetchError(null)
    setSaveResult(null)
    setHideInternal(loadHideInternal(lockedTeamSlug))
  }, [lockedTeamSlug])

  function toggleHideInternal() {
    const next = !hideInternal
    setHideInternal(next)
    saveHideInternal(lockedTeamSlug, next)
    // Drop any selected previews that would be hidden after toggle
    if (next) {
      const visibleIds = new Set(
        previews.filter((p) => !p.is_internal_scrim).map((p) => p.henrik_id)
      )
      setSelected((s) => new Set(Array.from(s).filter((id) => visibleIds.has(id))))
    }
  }

  // Visible previews (filtered by toggle); the underlying list stays intact in state
  const visiblePreviews = hideInternal
    ? previews.filter((p) => !p.is_internal_scrim)
    : previews
  const internalCount = previews.filter((p) => p.is_internal_scrim).length

  async function handleFetch() {
    setLoadState('fetching')
    setFetchError(null)
    setPreviews([])
    setSelected(new Set())
    setSaveResult(null)

    const res = await fetch('/api/import/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: lockedTeamSlug }),
    })
    const data = await res.json()

    if (!res.ok) {
      setFetchError(data.error ?? 'Fetch failed')
    } else {
      const next: MatchPreview[] = data.previews ?? []
      setPreviews(next)
      saveCache(lockedTeamSlug, next)
      setFetchedAt(Date.now())
      if (next.length === 0) {
        setFetchError('No new matches found. All recent matches are already imported or filtered out.')
      }
    }
    setLoadState('idle')
  }

  async function handleSave() {
    const toSave = previews.filter((p) => selected.has(p.henrik_id) && !p.is_already_in_db)
    if (!toSave.length) return

    setLoadState('saving')
    setSaveResult(null)

    const res = await fetch('/api/import/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamSlug: lockedTeamSlug, selectedMatches: toSave }),
    })
    const data = await res.json()

    if (!res.ok) {
      setFetchError(data.error ?? 'Save failed')
      setLoadState('idle')
      return
    }

    setSaveResult({ saved: data.saved, duplicates: data.duplicates ?? 0, errors: data.errors ?? [] })
    setLoadState('idle')

    // Optimistically mark just-saved matches as already-in-db in the cached list,
    // so re-visits don't show stale "importable" checkboxes for them.
    if (data.saved > 0) {
      const savedIds = new Set(toSave.map((p) => p.henrik_id))
      const updated = previews.map((p) =>
        savedIds.has(p.henrik_id) ? { ...p, is_already_in_db: true } : p
      )
      setPreviews(updated)
      saveCache(lockedTeamSlug, updated)
      setSelected(new Set())
      setTimeout(() => router.push('/app/matches'), 1200)
    }
  }

  function toggleAll() {
    const importable = visiblePreviews.filter((p) => !p.is_already_in_db).map((p) => p.henrik_id)
    const importableSet = new Set(importable)
    // If every importable visible row is already selected → deselect those; else select them
    const allSelected = importable.every((id) => selected.has(id)) && importable.length > 0
    if (allSelected) {
      setSelected((s) => new Set(Array.from(s).filter((id) => !importableSet.has(id))))
    } else {
      setSelected((s) => new Set([...Array.from(s), ...importable]))
    }
  }

  const importableCount = visiblePreviews.filter((p) => !p.is_already_in_db).length
  const selectedCount = Array.from(selected).filter((id) => {
    const p = visiblePreviews.find((p) => p.henrik_id === id)
    return p && !p.is_already_in_db
  }).length

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">data sync</p>
        <h1 className="text-2xl font-bold text-fg leading-tight mt-1">Import matches</h1>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center gap-2 h-[38px] px-3 rounded-lg border border-line-strong bg-surface">
          <span className="text-2xs uppercase tracking-[0.18em] px-2 py-0.5 rounded border border-gold/40 bg-gold/10 text-gold font-bold">
            {lockedTeamSlug}
          </span>
          <span className="text-sm text-fg truncate">{lockedTeamName}</span>
        </div>

        <button
          onClick={handleFetch}
          disabled={loadState !== 'idle'}
          className="bg-surface-2 border border-line-strong text-fg rounded-lg px-4 py-2 text-sm hover:border-gold hover:text-gold disabled:opacity-50 transition-colors"
        >
          {loadState === 'fetching' ? 'Fetching…' : previews.length > 0 ? 'Re-fetch' : 'Fetch latest'}
        </button>

        {rehydratableMatches.length > 0 && (
          <button
            onClick={handleRehydrateAll}
            disabled={loadState !== 'idle'}
            className="bg-surface-2 border border-line-strong text-fg rounded-lg px-4 py-2 text-sm hover:border-gold hover:text-gold disabled:opacity-50 transition-colors"
            title="Re-fetch every match from Henrik V4 to backfill new stats (ADR, HS%, util casts, etc.)"
          >
            {loadState === 'rehydrating' && rehydrateProgress
              ? `Rehydrating ${rehydrateProgress.done}/${rehydrateProgress.total}…`
              : `↻ Rehydrate all (${rehydratableMatches.length})`}
          </button>
        )}

        {rehydrateProgress && loadState !== 'rehydrating' && (
          <span className="text-2xs text-muted-2 uppercase tracking-wider">
            {rehydrateProgress.done}/{rehydrateProgress.total} done
            {rehydrateProgress.errors > 0 && (
              <span className="text-crimson ml-1">· {rehydrateProgress.errors} err</span>
            )}
          </span>
        )}

        {fetchedAt && (
          <span className="text-2xs text-muted-2 uppercase tracking-wider">
            cached {formatAge(fetchedAt)}
          </span>
        )}

        {fetchedAt && previews.length === 0 && (
          <button
            onClick={() => {
              clearCache(lockedTeamSlug)
              setPreviews([])
              setFetchedAt(null)
              setFetchError(null)
              setSaveResult(null)
            }}
            className="text-muted-2 text-sm hover:text-crimson transition-colors"
            title="Clear the cached empty result so a fresh fetch can run"
          >
            Reset
          </button>
        )}

        {previews.length > 0 && internalCount > 0 && (
          <label
            className="flex items-center gap-1.5 text-2xs text-muted-2 uppercase tracking-wider cursor-pointer select-none"
            title={`${internalCount} match${internalCount !== 1 ? 'es' : ''} detected against your other academy team`}
          >
            <input
              type="checkbox"
              checked={hideInternal}
              onChange={toggleHideInternal}
              className="w-3.5 h-3.5 accent-gold cursor-pointer"
            />
            Hide academy ({internalCount})
          </label>
        )}

        {previews.length > 0 && (
          <>
            <button
              onClick={toggleAll}
              className="text-muted-2 text-sm hover:text-fg transition-colors"
            >
              {selectedCount === importableCount && importableCount > 0 ? 'Deselect all' : 'Select all'}
            </button>

            <button
              onClick={() => {
                clearCache(lockedTeamSlug)
                setPreviews([])
                setSelected(new Set())
                setFetchedAt(null)
                setFetchError(null)
                setSaveResult(null)
              }}
              className="text-muted-2 text-sm hover:text-crimson transition-colors"
              title="Clear the cached list for this team"
            >
              Clear
            </button>

            <button
              onClick={handleSave}
              disabled={selectedCount === 0 || loadState !== 'idle'}
              className="ml-auto bg-gold text-black font-semibold rounded-lg px-5 py-2 text-sm hover:bg-gold-hover disabled:opacity-40 transition-colors"
            >
              {loadState === 'saving'
                ? 'Importing…'
                : `Import ${selectedCount > 0 ? selectedCount : ''} selected`}
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {fetchError && (
        <div className="bg-surface-2 border border-crimson/40 rounded-xl p-4 mb-4 text-crimson text-sm">
          {fetchError}
        </div>
      )}

      {/* Success */}
      {saveResult && (
        <div className="bg-surface-2 border border-win-green/40 rounded-xl p-4 mb-4 text-win-green text-sm">
          {saveResult.saved} match{saveResult.saved !== 1 ? 'es' : ''} imported.
          {saveResult.duplicates > 0 && (
            <span className="text-muted-2 ml-2">
              {saveResult.duplicates} already imported (skipped).
            </span>
          )}
          {saveResult.errors.length > 0 && (
            <span className="text-crimson ml-2">{saveResult.errors.length} error(s).</span>
          )}
          {saveResult.saved > 0 && <span className="text-muted-2 ml-2">Redirecting…</span>}
        </div>
      )}

      {/* Match list */}
      {visiblePreviews.length > 0 && (
        <div className="bg-surface-2 rounded-xl overflow-hidden">
          <div className="border-b border-line-strong px-4 py-2 flex items-center gap-4 text-muted-2 text-xs uppercase tracking-wide">
            <div className="w-5" />
            <div className="w-32">Date</div>
            <div className="flex-1">Map</div>
            <div className="w-16 text-center">Score</div>
            <div className="w-10 text-center">Result</div>
            <div className="w-20 text-center">Rounds</div>
            <div className="w-20 text-center">Mode</div>
            <div className="w-32">Opponent</div>
          </div>

          {visiblePreviews.map((p, i) => {
            const isChecked = selected.has(p.henrik_id)
            const disabled = p.is_already_in_db

            return (
              <label
                key={p.henrik_id}
                className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${
                  disabled ? 'opacity-50 cursor-default' : 'hover:bg-surface-3'
                } ${i !== visiblePreviews.length - 1 ? 'border-b border-line-strong' : ''}`}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={isChecked}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(p.henrik_id)
                    else next.delete(p.henrik_id)
                    setSelected(next)
                  }}
                  className="w-4 h-4 accent-gold"
                />
                <div className="w-32 text-muted-2 text-sm">{p.date}</div>
                <div className="flex-1 text-fg font-medium">{p.map}</div>
                <div className="w-16 text-center font-mono text-sm">
                  {p.our_score}–{p.opp_score}
                </div>
                <div className="w-10 text-center">
                  <ResultBadge result={p.result} />
                </div>
                <div className="w-20 text-center text-muted-2 text-sm">{p.rounds_played}</div>
                <div className="w-20 text-center">
                  {p.is_premier ? (
                    <span className="text-xs bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded">Premier</span>
                  ) : (
                    <span className="text-xs text-muted-2">Custom</span>
                  )}
                </div>
                <div className="w-32 text-muted-2 text-xs truncate flex items-center gap-1.5">
                  <span className="truncate">{p.opp_team_name}</span>
                  {p.is_internal_scrim && (
                    <span
                      className="text-2xs uppercase tracking-wider px-1 py-0.5 rounded bg-gold/15 text-gold border border-gold/40 shrink-0"
                      title="3+ opp players match your other academy team's roster"
                    >
                      acad
                    </span>
                  )}
                </div>
                {disabled && (
                  <span className="text-xs text-win-green ml-auto shrink-0">✓ imported</span>
                )}
              </label>
            )
          })}
        </div>
      )}

      {loadState === 'fetching' && (
        <div className="bg-surface-2 rounded-xl p-8 text-center text-muted-2 text-sm">
          Fetching from henrikdev…
        </div>
      )}
    </div>
  )
}
