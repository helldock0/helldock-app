'use client'

import { useMemo } from 'react'
import { MAP_RADARS, gameCoordToRadar } from '@/lib/valorant-maps'
import type { Map } from '@/lib/valorant'
import type { KillEventRow } from '@/app/api/kill-events/route'

type DotKind =
  | 'our_kill'
  | 'our_death'
  | 'pos_won'      // tactical: we held / retook AND won the round
  | 'pos_lost'    // tactical: we held / retook BUT lost the round
  | 'pos_neutral' // tactical: no recorded outcome on the round

type Dot = {
  x: number // normalized 0-1
  y: number // normalized 0-1
  kind: DotKind
  recencyWeight: number // 0-1; newer = closer to 1
}

export type MapHeatmapMode =
  | 'all'
  | 'first_blood'
  | 'post_plant_hold'  // our positions on ATT rounds, after we planted
  | 'retake_spot'      // our positions on DEF rounds, after they planted

export type MapHeatmapSide = 'all' | 'attack' | 'defense'

const TACTICAL_MODES = new Set<MapHeatmapMode>(['post_plant_hold', 'retake_spot'])

export function isTacticalMode(m: MapHeatmapMode): boolean {
  return TACTICAL_MODES.has(m)
}

const KIND_COLOR: Record<DotKind, string> = {
  our_kill: '#34d399', // win-green
  our_death: '#ef4444', // crimson
  pos_won: '#34d399', // win-green — valuable spot (we won the round)
  pos_lost: '#ef4444', // crimson — we still got fcked from this spot
  pos_neutral: '#FFD700', // gold — no outcome recorded
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

    const tactical = isTacticalMode(mode)
    // Tactical modes pin the side; the side toggle is ignored.
    const impliedSide: MapHeatmapSide =
      mode === 'post_plant_hold' ? 'attack' : mode === 'retake_spot' ? 'defense' : side

    const filtered = events.filter((e) => {
      if (mode === 'first_blood' && !e.is_first_blood) return false

      if (impliedSide !== 'all') {
        const s = (e.side ?? '').toLowerCase()
        if (impliedSide === 'attack' && s !== 'attack') return false
        if (impliedSide === 'defense' && s !== 'defense') return false
      }

      if (tactical) {
        // Only OUR shooters' positions are useful for hold / retake analysis.
        if (!e.killer_is_ours) return false
        // Must be a round that actually had a plant and a timestamped kill that
        // happened AFTER the plant.
        if (e.plant_time_in_round == null) return false
        if (e.ts_in_round_ms == null) return false
        if (e.ts_in_round_ms <= e.plant_time_in_round * 1000) return false
      }
      return true
    })

    const out: Dot[] = []
    for (const e of filtered) {
      // Tactical modes plot the SHOOTER position (where we held / where we
      // retook from); kill-feed modes plot the VICTIM position (where the
      // bullet landed).
      const cx = tactical ? e.killer_x : e.victim_x
      const cy = tactical ? e.killer_y : e.victim_y
      if (cx == null || cy == null) continue
      const norm = gameCoordToRadar(cx, cy, radar)
      // Clip outliers off the radar canvas.
      if (norm.x < -0.05 || norm.x > 1.05 || norm.y < -0.05 || norm.y > 1.05) continue

      const t = e.match_date ? new Date(e.match_date).getTime() : tMin
      const recencyWeight = 0.35 + 0.65 * ((t - tMin) / span)

      let kind: DotKind
      if (tactical) {
        if (e.round_outcome === 'W') kind = 'pos_won'
        else if (e.round_outcome === 'L') kind = 'pos_lost'
        else kind = 'pos_neutral'
      } else {
        kind = e.killer_is_ours ? 'our_kill' : 'our_death'
      }

      out.push({
        x: norm.x,
        y: norm.y,
        kind,
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

  const tactical = isTacticalMode(mode)
  const ourKills = dots.filter((d) => d.kind === 'our_kill').length
  const ourDeaths = dots.filter((d) => d.kind === 'our_death').length
  const posWon = dots.filter((d) => d.kind === 'pos_won').length
  const posLost = dots.filter((d) => d.kind === 'pos_lost').length
  const posNeutral = dots.filter((d) => d.kind === 'pos_neutral').length

  const tacticalLabel =
    mode === 'post_plant_hold'
      ? 'post-plant holds (ATT)'
      : mode === 'retake_spot'
      ? 'retake spots (DEF)'
      : ''

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
      <div className="mt-3 flex items-center justify-between text-2xs uppercase tracking-wider text-muted-2 gap-3 flex-wrap">
        {tactical ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: KIND_COLOR.pos_won }}
              />
              <span className="text-win-green tnum">{posWon}</span> valuable
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: KIND_COLOR.pos_lost }}
              />
              <span className="text-crimson tnum">{posLost}</span> fcked
            </span>
            {posNeutral > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: KIND_COLOR.pos_neutral }}
                />
                <span className="text-gold tnum">{posNeutral}</span> n/a
              </span>
            )}
            <span className="text-muted">· {tacticalLabel}</span>
          </div>
        ) : (
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
        )}
        <span className="text-muted">brighter = more recent</span>
      </div>
    </div>
  )
}
