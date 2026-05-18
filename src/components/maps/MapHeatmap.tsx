'use client'

import { useMemo } from 'react'
import { MAP_RADARS, gameCoordToRadar } from '@/lib/valorant-maps'
import type { Map } from '@/lib/valorant'
import type { KillEventRow } from '@/app/api/kill-events/route'

type DotKind = 'our_kill' | 'our_death'

type Dot = {
  x: number // normalized 0-1
  y: number // normalized 0-1
  kind: DotKind
  recencyWeight: number // 0-1; newer = closer to 1
}

export type MapHeatmapMode = 'all' | 'first_blood'
export type MapHeatmapSide = 'all' | 'attack' | 'defense'

const KIND_COLOR: Record<DotKind, string> = {
  our_kill: '#34d399', // win-green
  our_death: '#ef4444', // crimson
}

export default function MapHeatmap({
  mapName,
  events,
  mode,
  side,
}: {
  mapName: Map
  events: KillEventRow[]
  mode: MapHeatmapMode
  side: MapHeatmapSide
}) {
  const radar = MAP_RADARS[mapName]

  const dots: Dot[] = useMemo(() => {
    if (!radar) return []

    // Recency: bucket each event by match date so the most recent matches plot brightest.
    // We use the per-match date max as t=now, oldest as t=0.
    const dates = events
      .map((e) => (e.match_date ? new Date(e.match_date).getTime() : null))
      .filter((d): d is number => d != null)
    const tMax = dates.length ? Math.max(...dates) : 0
    const tMin = dates.length ? Math.min(...dates) : 0
    const span = Math.max(1, tMax - tMin)

    const filtered = events.filter((e) => {
      if (mode === 'first_blood' && !e.is_first_blood) return false
      if (side !== 'all') {
        const s = (e.side ?? '').toLowerCase()
        if (side === 'attack' && s !== 'attack') return false
        if (side === 'defense' && s !== 'defense') return false
      }
      return true
    })

    const out: Dot[] = []
    for (const e of filtered) {
      if (e.victim_x == null || e.victim_y == null) continue
      const norm = gameCoordToRadar(e.victim_x, e.victim_y, radar)
      // Clip outliers off the radar canvas.
      if (norm.x < -0.05 || norm.x > 1.05 || norm.y < -0.05 || norm.y > 1.05) continue

      const t = e.match_date ? new Date(e.match_date).getTime() : tMin
      const recencyWeight = 0.35 + 0.65 * ((t - tMin) / span)

      out.push({
        x: norm.x,
        y: norm.y,
        kind: e.killer_is_ours ? 'our_kill' : 'our_death',
        recencyWeight,
      })
    }
    return out
  }, [events, mode, side, radar])

  if (!radar) {
    return (
      <div className="text-sm text-muted py-8 text-center">
        No radar data for {mapName}.
      </div>
    )
  }

  const ourKills = dots.filter((d) => d.kind === 'our_kill').length
  const ourDeaths = dots.filter((d) => d.kind === 'our_death').length

  return (
    <div className="w-full">
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
          aria-label={`${mapName} kill-event heatmap`}
        >
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={0.011}
              fill={KIND_COLOR[d.kind]}
              fillOpacity={Math.max(0.18, d.recencyWeight * 0.7)}
              stroke={KIND_COLOR[d.kind]}
              strokeOpacity={Math.max(0.4, d.recencyWeight * 0.9)}
              strokeWidth={0.0015}
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-between text-2xs uppercase tracking-wider text-muted-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: KIND_COLOR.our_kill }}
            />
            <span className="text-win-green tnum">{ourKills}</span> our kills
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: KIND_COLOR.our_death }}
            />
            <span className="text-crimson tnum">{ourDeaths}</span> our deaths
          </span>
        </div>
        <span className="text-muted">brighter = more recent</span>
      </div>
    </div>
  )
}
