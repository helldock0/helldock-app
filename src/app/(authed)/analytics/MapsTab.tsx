'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { MapStat } from '@/lib/analytics'
import type { Map } from '@/lib/valorant'
import { MAP_RADARS } from '@/lib/valorant-maps'
import MapHeatmap, {
  isTacticalMode,
  type MapHeatmapMode,
  type MapHeatmapSide,
} from '@/components/maps/MapHeatmap'
import SiteExecuteHeatmap from './SiteExecuteHeatmap'
import type {
  KillEventRow,
  KillEventsResponse,
  RosterEntry,
} from '@/app/api/kill-events/route'

function Bar({ pct, color }: { pct: number | null; color: 'gold' | 'crimson' | 'muted' }) {
  const fill = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const colorClass =
    color === 'gold'
      ? 'bg-gold'
      : color === 'crimson'
      ? 'bg-crimson'
      : 'bg-muted-2'
  return (
    <div className="relative h-1.5 bg-line rounded-full overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 ${colorClass} rounded-full transition-[width] duration-300 ease-out`}
        style={{ width: `${fill}%` }}
      />
    </div>
  )
}

type FetchPayload = { events: KillEventRow[]; roster: RosterEntry[] }

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; events: KillEventRow[]; roster: RosterEntry[] }

export default function MapsTab({ maps }: { maps: MapStat[] }) {
  const played = maps.filter((m) => m.total > 0)
  const unplayed = maps.filter((m) => m.total === 0)

  const [activeMap, setActiveMap] = useState<Map | null>(null)
  const [mode, setMode] = useState<MapHeatmapMode>('first_blood')
  const [side, setSide] = useState<MapHeatmapSide>('all')
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' })
  const cacheRef = useRef<Map_<FetchPayload>>({})

  const openMap = useCallback((m: Map) => {
    setActiveMap(m)
    setMode('first_blood')
    setSide('all')
  }, [])

  const closeMap = useCallback(() => setActiveMap(null), [])

  // Lazy-fetch kill events on modal open, with per-map cache
  useEffect(() => {
    if (!activeMap) {
      setFetchState({ kind: 'idle' })
      return
    }
    const cached = cacheRef.current[activeMap]
    if (cached) {
      setFetchState({ kind: 'ready', events: cached.events, roster: cached.roster })
      return
    }
    let cancelled = false
    setFetchState({ kind: 'loading' })
    fetch(`/api/kill-events?map=${encodeURIComponent(activeMap)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const body = (await r.json()) as KillEventsResponse
        if (cancelled) return
        cacheRef.current[activeMap] = { events: body.events, roster: body.roster }
        setFetchState({ kind: 'ready', events: body.events, roster: body.roster })
      })
      .catch((e) => {
        if (cancelled) return
        setFetchState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'fetch failed',
        })
      })
    return () => {
      cancelled = true
    }
  }, [activeMap])

  // Close modal on ESC
  useEffect(() => {
    if (!activeMap) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMap()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeMap, closeMap])

  return (
    <div>
      {/* Site execute heatmap (compact ATT post-plant conversion grid) */}
      <SiteExecuteHeatmap maps={played} />

      {/* Played map grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {played.map((m) => (
          <MapCard key={m.map} stat={m} onOpenHeatmap={openMap} />
        ))}
      </div>

      {/* Unplayed maps — collapsed strip */}
      {unplayed.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
            Not played yet
          </p>
          <div className="flex flex-wrap gap-2">
            {unplayed.map((m) => (
              <span
                key={m.map}
                className="text-xs px-2.5 py-1 rounded-md bg-surface-2 border border-line text-muted-2"
              >
                {m.map}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap modal */}
      {activeMap && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/85"
          onClick={closeMap}
          role="dialog"
          aria-modal="true"
          aria-label={`${activeMap} kill-event heatmap`}
        >
          <div
            className="relative bg-surface border border-line-strong rounded-2xl max-w-2xl w-full max-h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-line gap-4">
              <div>
                <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                  kill-event heatmap
                </p>
                <h2 className="text-2xl font-bold text-gold leading-tight">
                  {activeMap}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeMap}
                className="text-muted hover:text-fg text-xl leading-none px-2"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Toggles */}
            <div className="px-5 pt-4 flex flex-wrap items-center gap-3">
              <ToggleGroup
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'first_blood', label: 'First contact' },
                  { value: 'all', label: 'All kills' },
                  { value: 'post_plant_hold', label: 'Post-plant holds' },
                  { value: 'retake_spot', label: 'Retake spots' },
                  { value: 'round_endpoint', label: 'Round endpoints' },
                  { value: 'plant_cluster', label: 'Plant cluster' },
                ]}
              />
              {/* post-plant / retake pin the side; round_endpoint respects it. */}
              {(mode === 'round_endpoint' || !isTacticalMode(mode)) && (
                <ToggleGroup
                  value={side}
                  onChange={setSide}
                  options={[
                    { value: 'all', label: 'Both' },
                    { value: 'attack', label: 'ATT' },
                    { value: 'defense', label: 'DEF' },
                  ]}
                />
              )}
            </div>

            <div className="p-5">
              {fetchState.kind === 'loading' && (
                <div className="py-12 text-center text-sm text-muted">
                  Loading kill events…
                </div>
              )}
              {fetchState.kind === 'error' && (
                <div className="py-12 text-center text-sm text-crimson">
                  Failed to load: {fetchState.message}
                </div>
              )}
              {fetchState.kind === 'ready' && (
                <MapHeatmap
                  mapName={activeMap}
                  events={fetchState.events}
                  roster={fetchState.roster}
                  mode={mode}
                  side={side}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper alias to avoid clashing with the imported `Map` type from valorant.ts.
type Map_<V> = Record<string, V | undefined>

function ToggleGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex rounded-md border border-line-strong/60 overflow-hidden text-2xs uppercase tracking-wider">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1.5 transition-colors ${
              active ? 'bg-gold/15 text-gold' : 'text-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

const TIER_BADGE: Record<string, string> = {
  S: 'bg-win-green/15 text-win-green border-win-green/40',
  A: 'bg-gold/15 text-gold border-gold/40',
  B: 'bg-blue-400/15 text-blue-300 border-blue-400/40',
  C: 'bg-crimson/15 text-crimson border-crimson/40',
  DEV: 'bg-surface text-muted border-line-strong',
}

function MapCard({
  stat,
  onOpenHeatmap,
}: {
  stat: MapStat
  onOpenHeatmap: (m: Map) => void
}) {
  const hasRadar = stat.map in MAP_RADARS

  return (
    <div className="bg-surface-2 rounded-2xl p-5 border border-line-strong/40 h-full transition-colors hover:bg-surface-3 hover:border-line-strong">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-lg font-semibold text-fg leading-tight">{stat.map}</div>
          <div className="text-xs text-muted mt-0.5 tnum">
            {stat.total} {stat.total === 1 ? 'game' : 'games'} ·{' '}
            <span className="text-win-green">{stat.wins}W</span>
            {' · '}
            <span className="text-crimson">{stat.losses}L</span>
            {stat.avgFor != null && stat.avgAgainst != null && (
              <span className="text-muted-2 ml-1.5">
                · avg {stat.avgFor}–{stat.avgAgainst}
              </span>
            )}
          </div>
        </div>
        <span
          className={`text-2xs uppercase tracking-wider px-2 py-0.5 rounded border font-bold ${TIER_BADGE[stat.tier]}`}
          title="Map comfort tier"
        >
          {stat.tier}
        </span>
      </div>

      {/* Overall win % */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">
            Win rate
          </span>
          <span className="text-xl font-bold text-gold tnum">
            {stat.winPct == null ? '—' : `${stat.winPct}%`}
          </span>
        </div>
        <Bar pct={stat.winPct} color="gold" />
      </div>

      {/* Side splits */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-2xs uppercase tracking-wider text-muted-2">ATT</span>
            <span className="text-xs text-fg tnum">
              {stat.attPct == null ? '—' : `${stat.attPct}%`}
              <span className="text-muted-2 ml-1">n={stat.attTotal}</span>
            </span>
          </div>
          <Bar pct={stat.attPct} color="gold" />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-2xs uppercase tracking-wider text-muted-2">DEF</span>
            <span className="text-xs text-fg tnum">
              {stat.defPct == null ? '—' : `${stat.defPct}%`}
              <span className="text-muted-2 ml-1">n={stat.defTotal}</span>
            </span>
          </div>
          <Bar pct={stat.defPct} color="crimson" />
        </div>
      </div>

      {/* Pistol + econ chips */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Chip label="Pistol ATT" value={stat.pistolAttPct} n={stat.pistolAttTotal} color="gold" />
        <Chip label="Pistol DEF" value={stat.pistolDefPct} n={stat.pistolDefTotal} color="crimson" />
        <Chip label="Anti-Eco" value={stat.antiEcoPct} n={stat.antiEcoTotal} color="muted" />
        <Chip label="Eco" value={stat.ecoPct} n={stat.ecoTotal} color="muted" />
      </div>

      {/* Site executes */}
      {(stat.aSiteExecTotal + stat.bSiteExecTotal + stat.cSiteExecTotal > 0) && (
        <div className="mb-4 pt-3 border-t border-line">
          <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
            Site execute (ATT)
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SiteBar label="A" pct={stat.aSiteExecPct} n={stat.aSiteExecTotal} />
            <SiteBar label="B" pct={stat.bSiteExecPct} n={stat.bSiteExecTotal} />
            <SiteBar label="C" pct={stat.cSiteExecPct} n={stat.cSiteExecTotal} />
          </div>
        </div>
      )}

      {/* Top comps */}
      {stat.topComps.length > 0 && (
        <div className="pt-3 border-t border-line mb-4">
          <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
            Top comps
          </div>
          <div className="space-y-1.5">
            {stat.topComps.map((c) => (
              <div
                key={c.agents.join(',')}
                className="flex items-center justify-between text-xs gap-2"
              >
                <span className="text-2xs uppercase tracking-wider text-muted-2 shrink-0">
                  {c.archetype}
                </span>
                <span className="text-fg/90 truncate flex-1 mx-1">
                  {c.agents.join(' · ')}
                </span>
                <span className="font-mono text-muted tnum shrink-0">
                  <span className="text-win-green">{c.wins}</span>-
                  <span className="text-crimson">{c.total - c.wins}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 pt-3 border-t border-line">
        {hasRadar ? (
          <button
            type="button"
            onClick={() => onOpenHeatmap(stat.map as Map)}
            className="text-xs uppercase tracking-wider px-2.5 py-1.5 rounded-md bg-gold/10 border border-gold/40 text-gold hover:bg-gold/20 transition-colors"
          >
            🎯 Heatmap
          </button>
        ) : (
          <span className="text-2xs text-muted-2">no radar</span>
        )}
        <Link
          href={`/matches?map=${encodeURIComponent(stat.map)}`}
          className="text-2xs uppercase tracking-wider text-muted hover:text-gold"
        >
          All matches →
        </Link>
      </div>
    </div>
  )
}

function Chip({
  label,
  value,
  n,
  color,
}: {
  label: string
  value: number | null
  n: number
  color: 'gold' | 'crimson' | 'muted'
}) {
  const v = value == null ? '—' : `${value}%`
  const valColor =
    color === 'gold' ? 'text-gold' : color === 'crimson' ? 'text-crimson' : 'text-fg'
  return (
    <div className="bg-surface rounded-md px-2 py-1.5 flex items-baseline justify-between">
      <span className="text-2xs uppercase tracking-wider text-muted-2">{label}</span>
      <span className="text-xs tnum">
        <span className={`${valColor} font-medium`}>{v}</span>
        <span className="text-muted-2 ml-1">n={n}</span>
      </span>
    </div>
  )
}

function SiteBar({ label, pct, n }: { label: string; pct: number | null; n: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-2xs uppercase tracking-wider text-muted-2">{label}</span>
        <span className="text-xs text-fg tnum">
          {pct == null ? '—' : `${pct}%`}
          <span className="text-muted-2 ml-1">n={n}</span>
        </span>
      </div>
      <Bar pct={pct} color="gold" />
    </div>
  )
}
