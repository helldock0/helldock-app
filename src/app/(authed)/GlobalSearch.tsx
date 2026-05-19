'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SearchResponse } from '@/app/api/search/route'

const DEBOUNCE_MS = 200

function fmtDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return d
  }
}

const EMPTY: SearchResponse = { q: '', matches: [], players: [], opponents: [] }

export default function GlobalSearch() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResponse>(EMPTY)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Debounced fetch
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = (await res.json()) as SearchResponse
        if (!cancelled) {
          setResults(body)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setResults(EMPTY)
          setLoading(false)
        }
      }
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  // Click-outside + Escape to close
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Global "/" shortcut to focus search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      inputRef.current?.focus()
      setOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const hasAny =
    results.matches.length > 0 ||
    results.players.length > 0 ||
    results.opponents.length > 0
  const showDropdown = open && q.trim().length >= 2

  function navigateAndClose(href: string) {
    close()
    setQ('')
    router.push(href)
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search matches, players, opponents…   /"
          aria-label="Global search"
          className="w-full bg-surface-2 border border-line-strong/60 text-fg placeholder:text-muted-2 rounded-md pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-gold/60 transition-colors"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-2 pointer-events-none"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-1 bg-surface-2 border border-line-strong rounded-lg shadow-xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">
          {loading && !hasAny ? (
            <div className="px-3 py-3 text-2xs text-muted-2">searching…</div>
          ) : !hasAny ? (
            <div className="px-3 py-3 text-2xs text-muted-2">
              no results for &ldquo;{q}&rdquo;
            </div>
          ) : (
            <>
              {results.matches.length > 0 && (
                <Group title="Matches">
                  {results.matches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => navigateAndClose(`/matches/${m.matchIdHelldock}`)}
                      className="w-full text-left px-3 py-1.5 hover:bg-surface-3 transition-colors flex items-center gap-2 text-xs"
                    >
                      <span className="font-mono text-gold tnum w-14 shrink-0">
                        {m.matchIdHelldock}
                      </span>
                      <span className="text-muted tnum w-14 shrink-0">
                        {fmtDate(m.date)}
                      </span>
                      <span className="text-fg flex-1 truncate">
                        {m.map ?? '—'}
                        {m.opp && (
                          <span className="text-muted-2 ml-1.5">vs {m.opp}</span>
                        )}
                      </span>
                      <span className="font-mono tnum text-fg w-12 text-right shrink-0">
                        {m.ourScore != null && m.oppScore != null
                          ? `${m.ourScore}–${m.oppScore}`
                          : '—'}
                      </span>
                      <span
                        className={`font-bold w-4 text-center shrink-0 ${
                          m.result === 'W'
                            ? 'text-win-green'
                            : m.result === 'L'
                            ? 'text-crimson'
                            : 'text-muted-2'
                        }`}
                      >
                        {m.result ?? '—'}
                      </span>
                    </button>
                  ))}
                </Group>
              )}

              {results.players.length > 0 && (
                <Group title="Players">
                  {results.players.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => navigateAndClose(`/players/${encodeURIComponent(p.id)}`)}
                      className="w-full text-left px-3 py-1.5 hover:bg-surface-3 transition-colors flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-fg truncate">{p.name}</span>
                      <span className="text-2xs text-muted-2 tnum shrink-0">
                        n={p.games}
                      </span>
                    </button>
                  ))}
                </Group>
              )}

              {results.opponents.length > 0 && (
                <Group title="Opponents">
                  {results.opponents.map((o) => (
                    <Link
                      key={o.name}
                      href={`/opponents/${encodeURIComponent(o.name)}`}
                      onClick={close}
                      className="w-full block px-3 py-1.5 hover:bg-surface-3 transition-colors flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-fg truncate">{o.name}</span>
                      <span className="text-2xs text-muted-2 tnum shrink-0">
                        {o.games} match{o.games !== 1 ? 'es' : ''}
                      </span>
                    </Link>
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="px-3 pt-2 pb-1 text-2xs uppercase tracking-[0.16em] text-muted-2">
        {title}
      </div>
      <div className="pb-1">{children}</div>
    </div>
  )
}
