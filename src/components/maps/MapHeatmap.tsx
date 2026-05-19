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
  | 'round_endpoint'   // position of our last alive/dead player when the round ended
  | 'plant_cluster'    // fights within ±5s of plant on ATT rounds (proxy for plant location)

export type MapHeatmapSide = 'all' | 'attack' | 'defense'

const TACTICAL_MODES = new Set<MapHeatmapMode>([
  'post_plant_hold',
  'retake_spot',
  'round_endpoint',
  'plant_cluster',
])

// Width of the time window around plant_time used by plant_cluster mode.
const PLANT_WINDOW_MS = 5000

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
      mode === 'post_plant_hold'
        ? 'attack'
        : mode === 'retake_spot'
        ? 'defense'
        : mode === 'plant_cluster'
        ? 'attack' // plant_cluster only makes sense for our ATT rounds
        : mode === 'round_endpoint'
        ? side // round_endpoint respects the side toggle
        : side

    let working = events
    if (mode === 'round_endpoint') {
      // For each (match, round), keep ONLY the latest-timestamp event. That
      // event's position is where the round actually ended — either the spot
      // where we picked the last opponent (if we won the duel) or where our
      // last player died (if they killed us last).
      const byRound: Record<string, KillEventRow> = {}
      for (const e of events) {
        if (e.ts_in_round_ms == null) continue
        const key = `${e.match_id}|${e.round_num}`
        const cur = byRound[key]
        if (!cur || (cur.ts_in_round_ms ?? -1) < e.ts_in_round_ms) {
          byRound[key] = e
        }
      }
      working = Object.values(byRound)
    }

    const filtered = working.filter((e) => {
      if (mode === 'first_blood' && !e.is_first_blood) return false

      if (impliedSide !== 'all') {
        const s = (e.side ?? '').toLowerCase()
        if (impliedSide === 'attack' && s !== 'attack') return false
        if (impliedSide === 'defense' && s !== 'defense') return false
      }

      if (mode === 'post_plant_hold' || mode === 'retake_spot') {
        // Only OUR shooters' positions are useful for hold / retake analysis.
        if (!e.killer_is_ours) return false
        // Must be a round that actually had a plant and a timestamped kill that
        // happened AFTER the plant.
        if (e.plant_time_in_round == null) return false
        if (e.ts_in_round_ms == null) return false
        if (e.ts_in_round_ms <= e.plant_time_in_round * 1000) return false
      }

      if (mode === 'plant_cluster') {
        // Fights within ±PLANT_WINDOW_MS of the bomb plant. Best available
        // proxy for "where did the execute land on site" — we don't store the
        // planter's coordinate directly.
        if (e.plant_time_in_round == null) return false
        if (e.ts_in_round_ms == null) return false
        const dt = e.ts_in_round_ms - e.plant_time_in_round * 1000
        if (Math.abs(dt) > PLANT_WINDOW_MS) return false
      }
      return true
    })

    const out: Dot[] = []
    for (const e of filtered) {
      // Coord choice:
      //  · post_plant_hold / retake_spot → killer (shooter) position
      //  · round_endpoint → if WE made the last kill, plot killer pos (we held it);
      //    if THEY made the last kill, plot victim pos (where our last guy fell)
      //  · first_blood / all → victim position (where the bullet landed)
      let cx: number | null
      let cy: number | null
      if (mode === 'round_endpoint') {
        if (e.killer_is_ours) {
          cx = e.killer_x
          cy = e.killer_y
        } else {
          cx = e.victim_x
          cy = e.victim_y
        }
      } else if (mode === 'plant_cluster') {
        // The bullet's landing spot is the best radar-anchor for "where the
        // execute happened" — kills tend to cluster on/near the plant.
        cx = e.victim_x
        cy = e.victim_y
      } else if (tactical) {
        cx = e.killer_x
        cy = e.killer_y
      } else {
        cx = e.victim_x
        cy = e.victim_y
      }
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
      : mode === 'round_endpoint'
      ? 'where rounds ended'
      : mode === 'plant_cluster'
      ? 'fights near plant (ATT, ±5s)'
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
