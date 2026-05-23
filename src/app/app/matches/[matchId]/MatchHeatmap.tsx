'use client'

// Per-match kill heatmap embedded on the match detail page. Simplified version
// of the analytics MapHeatmap modal — single match, no mode picker, no filters.
// Just a dots/density view toggle over the kill events for THIS match.

import { useEffect, useMemo, useState } from 'react'
import { MAP_RADARS, gameCoordToRadar } from '@/lib/valorant-maps'
import type { Map } from '@/lib/valorant'
import { DensityLayers, type DensityLayer, type DensityPoint } from '@/lib/density-svg'

export type MatchHeatmapEvent = {
  killer_x: number | null
  killer_y: number | null
  victim_x: number | null
  victim_y: number | null
  killer_is_ours: boolean | null
}

type View = 'auto' | 'dots' | 'density'

const STORAGE_KEY = 'helldock.matchHeatmap.view'
const DENSITY_AUTO_THRESHOLD = 50
// SVG fills must be hex literals (Recharts/SVG don't read Tailwind classes).
// Keep these in sync with the win-green / crimson Tailwind tokens.
const OUR_KILL_COLOR = '#34D399' // = win-green token
const OUR_DEATH_COLOR = '#DC143C' // = crimson token

export default function MatchHeatmap({
  mapName,
  events,
}: {
  mapName: string | null
  events: MatchHeatmapEvent[]
}) {
  const radar = mapName ? MAP_RADARS[mapName as Map] : undefined

  const [view, setView] = useState<View>('auto')
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as View | null
      if (stored === 'auto' || stored === 'dots' || stored === 'density') setView(stored)
    } catch {
      // ignore
    }
  }, [])
  function changeView(next: View) {
    setView(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
  }

  // Project victim-pos to radar coords, partition by killer_is_ours.
  const { killPts, deathPts } = useMemo(() => {
    const k: DensityPoint[] = []
    const d: DensityPoint[] = []
    if (!radar) return { killPts: k, deathPts: d }
    for (const e of events) {
      if (e.victim_x == null || e.victim_y == null) continue
      const { x, y } = gameCoordToRadar(e.victim_x, e.victim_y, radar)
      if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) continue
      if (e.killer_is_ours) k.push({ x, y })
      else d.push({ x, y })
    }
    return { killPts: k, deathPts: d }
  }, [events, radar])

  const total = killPts.length + deathPts.length
  const effectiveView: 'dots' | 'density' =
    view === 'auto' ? (total > DENSITY_AUTO_THRESHOLD ? 'density' : 'dots') : view

  const densityLayers: DensityLayer[] = useMemo(() => {
    const layers: DensityLayer[] = []
    if (killPts.length > 0) {
      layers.push({ filterId: 'mh-kills', color: OUR_KILL_COLOR, points: killPts })
    }
    if (deathPts.length > 0) {
      layers.push({ filterId: 'mh-deaths', color: OUR_DEATH_COLOR, points: deathPts })
    }
    return layers
  }, [killPts, deathPts])

  if (!mapName) {
    return (
      <div className="text-sm text-muted py-6 text-center">
        No map recorded for this match.
      </div>
    )
  }
  if (!radar) {
    return (
      <div className="text-sm text-muted py-6 text-center">
        No radar data available for {mapName}.
      </div>
    )
  }
  if (total === 0) {
    return (
      <div className="text-sm text-muted py-6 text-center">
        No kill events recorded for this match. Try rehydrating from Henrik if this is a
        scrim or Premier game.
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* View toggle */}
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="inline-flex rounded-md border border-line-strong overflow-hidden text-2xs">
          {(['auto', 'dots', 'density'] as View[]).map((v, i) => {
            const active = view === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                className={`px-2.5 py-1 uppercase tracking-wider transition-colors ${i > 0 ? 'border-l border-line-strong' : ''} ${
                  active
                    ? 'bg-gold/20 text-gold font-semibold'
                    : 'bg-surface text-muted hover:text-fg'
                }`}
              >
                {v}
                {v === 'auto' && view === 'auto' && (
                  <span className="ml-1 text-muted-2 normal-case tracking-normal">
                    ({effectiveView})
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <span className="text-2xs uppercase tracking-wider text-muted-2 tnum">
          {killPts.length} K · {deathPts.length} D
        </span>
      </div>

      <div className="relative aspect-square w-full bg-black rounded-lg overflow-hidden border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={radar.radarUrl}
          alt={`${mapName} radar`}
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <svg
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          aria-label={`${mapName} match kill heatmap`}
        >
          {effectiveView === 'density' ? (
            <DensityLayers layers={densityLayers} />
          ) : (
            <>
              {killPts.map((p, i) => (
                <circle
                  key={`k${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={0.011}
                  fill={OUR_KILL_COLOR}
                  fillOpacity={0.6}
                  stroke={OUR_KILL_COLOR}
                  strokeOpacity={0.85}
                  strokeWidth={0.0015}
                />
              ))}
              {deathPts.map((p, i) => (
                <circle
                  key={`d${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={0.011}
                  fill={OUR_DEATH_COLOR}
                  fillOpacity={0.6}
                  stroke={OUR_DEATH_COLOR}
                  strokeOpacity={0.85}
                  strokeWidth={0.0015}
                />
              ))}
            </>
          )}
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-4 text-2xs uppercase tracking-wider text-muted-2">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: OUR_KILL_COLOR }}
          />
          <span className="text-win-green tnum">{killPts.length}</span> our kills
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: OUR_DEATH_COLOR }}
          />
          <span className="text-crimson tnum">{deathPts.length}</span> our deaths
        </span>
      </div>
    </div>
  )
}
