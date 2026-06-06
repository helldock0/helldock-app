'use client'

import { useEffect, useMemo, useState } from 'react'
import { MAP_RADARS, gameCoordToRadar } from '@/lib/valorant-maps'
import type { Map } from '@/lib/valorant'
import type { KillEventRow, RosterEntry } from '@/app/api/kill-events/route'
import { DensityLayers, type DensityLayer } from '@/lib/density-svg'

export type MapHeatmapView = 'auto' | 'dots' | 'density'
export type MapHeatmapWindow = 'all' | '30d' | '7d'

const VIEW_STORAGE_KEY = 'helldock.mapHeatmap.view'
// Above this point count, density renders better than dots — overlap blurs into soup.
const DENSITY_AUTO_THRESHOLD = 50
const DAY_MS = 24 * 60 * 60 * 1000

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
  pos_won: '#34d399', // win-green
  pos_lost: '#ef4444', // crimson
  pos_neutral: '#FFD700', // gold
}

type HeatmapIntent = {
  title: string
  question: string
  read: string
  next: string
}

const MODE_INTENT: Record<MapHeatmapMode, HeatmapIntent> = {
  first_blood: {
    title: 'Opening fight map',
    question: 'Where do first kills and first deaths happen?',
    read: 'Green means we got the first pick. Red means we died first.',
    next: 'If one red lane repeats, change the default route or send a trader with that player.',
  },
  all: {
    title: 'All fight map',
    question: 'Where are fights helping or hurting us overall?',
    read: 'Green means we got the kill there. Red means we died there.',
    next: 'Keep the green fight spots and review any red cluster before the next scrim.',
  },
  post_plant_hold: {
    title: 'After-plant hold map',
    question: 'After we plant, which hold spots help us close the round?',
    read: 'Green means that hold ended in a round win. Red means that hold still lost the round.',
    next: 'Keep green holds. Replace red holds with safer crossfires, earlier repositioning, or better support utility.',
  },
  retake_spot: {
    title: 'Retake map',
    question: 'When they plant, which retake positions actually win rounds?',
    read: 'Green means the retake position ended in a win. Red means the retake position lost.',
    next: 'Use red clusters to review retake route, spacing, timing, and utility before the next block.',
  },
  round_endpoint: {
    title: 'Round finish map',
    question: 'Where do rounds actually end for us?',
    read: 'Green means the final fight ended in a win. Red means the final fight ended in a loss.',
    next: 'Repeated red endings usually point to late-round positioning, isolation, or slow trade timing.',
  },
  plant_cluster: {
    title: 'Plant fight map',
    question: 'Around our plant timing, where are fights happening?',
    read: 'Green means the plant fight helped convert the round. Red means the fight did not convert.',
    next: 'Use this to check if the execute lands in safe space or needs different clearing and support.',
  },
}

function heatmapViewLabel(view: MapHeatmapView): string {
  if (view === 'auto') return 'Smart'
  if (view === 'density') return 'Cloud'
  return 'Dots'
}

function effectiveViewLabel(view: 'dots' | 'density'): string {
  return view === 'density' ? 'cloud' : 'dots'
}

export default function MapHeatmap({
  mapName,
  events,
  roster,
  mode,
  side,
}: {
  mapName: Map
  events: KillEventRow[]
  /** Team roster for the player filter dropdown. Pass empty array to hide it. */
  roster?: RosterEntry[]
  mode: MapHeatmapMode
  side: MapHeatmapSide
}) {
  const radar = MAP_RADARS[mapName]

  // Part 2 filters — all client-side over the already-loaded events.
  const [playerFilter, setPlayerFilter] = useState<string>('all') // 'all' or puuid
  const [opponentFilter, setOpponentFilter] = useState<string>('all') // 'all' or opponent_name
  const [dateWindow, setDateWindow] = useState<MapHeatmapWindow>('all')

  // Distinct opponent_names that appear in the raw events — populates the dropdown.
  const opponentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) if (e.opponent_name) set.add(e.opponent_name)
    return Array.from(set).sort()
  }, [events])

  // Apply filters BEFORE dot generation. The mode/side filters in the dots useMemo
  // still apply on top of these.
  const filteredEvents = useMemo(() => {
    if (playerFilter === 'all' && opponentFilter === 'all' && dateWindow === 'all') {
      return events
    }
    const cutoff =
      dateWindow === '7d'
        ? Date.now() - 7 * DAY_MS
        : dateWindow === '30d'
        ? Date.now() - 30 * DAY_MS
        : 0
    return events.filter((e) => {
      if (playerFilter !== 'all') {
        // Match if this player was either the killer or the victim.
        if (e.killer_puuid !== playerFilter && e.victim_puuid !== playerFilter) {
          return false
        }
      }
      if (opponentFilter !== 'all' && e.opponent_name !== opponentFilter) return false
      if (cutoff > 0) {
        if (!e.match_date) return false
        if (new Date(e.match_date).getTime() < cutoff) return false
      }
      return true
    })
  }, [events, playerFilter, opponentFilter, dateWindow])

  const filtersActive =
    playerFilter !== 'all' || opponentFilter !== 'all' || dateWindow !== 'all'
  function clearFilters() {
    setPlayerFilter('all')
    setOpponentFilter('all')
    setDateWindow('all')
  }

  // View toggle (auto / dots / density). Persisted in localStorage so the
  // choice survives modal re-opens.
  const [view, setView] = useState<MapHeatmapView>('auto')
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY) as MapHeatmapView | null
      if (stored === 'auto' || stored === 'dots' || stored === 'density') setView(stored)
    } catch {
      // localStorage blocked — stay on default 'auto'
    }
  }, [])
  function changeView(next: MapHeatmapView) {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // ignore — preference just won't persist
    }
  }

  const dots: Dot[] = useMemo(() => {
    if (!radar) return []

    // Recency: bucket each event by match date so the most recent matches plot brightest.
    // We use the per-match date max as t=now, oldest as t=0.
    const dates = filteredEvents
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

    let working = filteredEvents
    if (mode === 'round_endpoint') {
      // For each (match, round), keep ONLY the latest-timestamp event. That
      // event's position is where the round actually ended — either the spot
      // where we picked the last opponent (if we won the duel) or where our
      // last player died (if they killed us last).
      const byRound: Record<string, KillEventRow> = {}
      for (const e of filteredEvents) {
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
  }, [filteredEvents, mode, side, radar])

  // Group dots into kill/death/neutral layers for density rendering.
  // Hook MUST come before any early return — react-hooks/rules-of-hooks.
  const densityLayers: DensityLayer[] = useMemo(() => {
    const kills = dots.filter((d) => d.kind === 'our_kill' || d.kind === 'pos_won')
    const deaths = dots.filter((d) => d.kind === 'our_death' || d.kind === 'pos_lost')
    const neutral = dots.filter((d) => d.kind === 'pos_neutral')
    const out: DensityLayer[] = []
    if (kills.length > 0) out.push({ filterId: 'kills', color: KIND_COLOR.our_kill, points: kills })
    if (deaths.length > 0) out.push({ filterId: 'deaths', color: KIND_COLOR.our_death, points: deaths })
    if (neutral.length > 0) out.push({ filterId: 'neutral', color: KIND_COLOR.pos_neutral, points: neutral })
    return out
  }, [dots])

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
  const intent = MODE_INTENT[mode]
  const sampleRead = tactical
    ? `${posWon} green round wins, ${posLost} red round losses${
        posNeutral > 0 ? `, ${posNeutral} yellow unknown outcomes` : ''
      }.`
    : `${ourKills} green kills, ${ourDeaths} red deaths.`

  // Effective render mode — 'auto' picks density once we cross the soup threshold.
  const effectiveView: 'dots' | 'density' =
    view === 'auto'
      ? dots.length > DENSITY_AUTO_THRESHOLD
        ? 'density'
        : 'dots'
      : view

  const tacticalLabel =
    mode === 'post_plant_hold'
      ? 'after our plant'
      : mode === 'retake_spot'
      ? 'when we retake'
      : mode === 'round_endpoint'
      ? 'round finish spots'
      : mode === 'plant_cluster'
      ? 'around plant timing'
      : ''

  return (
    <div className="w-full">
      <div className="mb-3 rounded-lg border border-line bg-surface-2 px-3 py-3">
        <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
          What this view answers
        </p>
        <h3 className="mt-1 text-sm font-semibold text-fg">{intent.title}</h3>
        <p className="mt-1 text-xs text-muted leading-relaxed">{intent.question}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md bg-surface border border-line px-2.5 py-2">
            <p className="text-2xs uppercase tracking-wider text-muted-2">Read</p>
            <p className="mt-1 text-xs text-fg/90 leading-relaxed">
              {intent.read} {sampleRead}
            </p>
          </div>
          <div className="rounded-md bg-surface border border-line px-2.5 py-2">
            <p className="text-2xs uppercase tracking-wider text-muted-2">Review next</p>
            <p className="mt-1 text-xs text-fg/90 leading-relaxed">{intent.next}</p>
          </div>
        </div>
      </div>

      {/* Filters — all client-side over the already-loaded events. */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {roster && roster.length > 0 && (
          <label className="flex items-center gap-1.5">
            <span className="text-2xs uppercase tracking-wider text-muted-2">player</span>
            <select
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
              className="bg-surface border border-line-strong text-fg text-2xs rounded px-2 py-1 hover:border-gold/60 transition-colors"
            >
              <option value="all">Any</option>
              {roster.map((r) => (
                <option key={r.puuid} value={r.puuid}>
                  {r.display_name}
                </option>
              ))}
            </select>
          </label>
        )}
        {opponentOptions.length > 1 && (
          <label className="flex items-center gap-1.5">
            <span className="text-2xs uppercase tracking-wider text-muted-2">opp</span>
            <select
              value={opponentFilter}
              onChange={(e) => setOpponentFilter(e.target.value)}
              className="bg-surface border border-line-strong text-fg text-2xs rounded px-2 py-1 hover:border-gold/60 transition-colors max-w-[10rem]"
            >
              <option value="all">Any</option>
              {opponentOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="inline-flex rounded border border-line-strong overflow-hidden text-2xs">
          {(['7d', '30d', 'all'] as MapHeatmapWindow[]).map((w, i) => {
            const active = dateWindow === w
            return (
              <button
                key={w}
                type="button"
                onClick={() => setDateWindow(w)}
                className={`px-2 py-1 uppercase tracking-wider transition-colors ${i > 0 ? 'border-l border-line-strong' : ''} ${
                  active
                    ? 'bg-gold/20 text-gold font-semibold'
                    : 'bg-surface text-muted hover:text-fg'
                }`}
              >
                {w === 'all' ? 'all time' : w}
              </button>
            )
          })}
        </div>
        {filtersActive && (
          <>
            <span className="text-2xs text-muted-2 tnum">
              {filteredEvents.length} of {events.length}
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="text-2xs uppercase tracking-wider text-crimson hover:text-crimson/80 transition-colors ml-auto"
            >
              clear
            </button>
          </>
        )}
      </div>

      {/* View toggle. Smart picks the clearest view for the event count. */}
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="inline-flex rounded-md border border-line-strong overflow-hidden text-2xs">
          {(['auto', 'dots', 'density'] as MapHeatmapView[]).map((v, i) => {
            const active = view === v
            const showAutoTag = v === 'auto' && view === 'auto'
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
                {heatmapViewLabel(v)}
                {showAutoTag && (
                  <span className="ml-1 text-muted-2 normal-case tracking-normal">
                    ({effectiveViewLabel(effectiveView)})
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <span className="text-2xs text-muted-2 uppercase tracking-wider tnum">
          {dots.length} event{dots.length === 1 ? '' : 's'}
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
          aria-label={`${mapName} map fight review`}
        >
          {effectiveView === 'density' ? (
            <DensityLayers layers={densityLayers} />
          ) : (
            dots.map((d, i) => (
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
            ))
          )}
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
              <span className="text-win-green tnum">{posWon}</span> round won
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: KIND_COLOR.pos_lost }}
              />
              <span className="text-crimson tnum">{posLost}</span> round lost
            </span>
            {posNeutral > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: KIND_COLOR.pos_neutral }}
                />
                <span className="text-gold tnum">{posNeutral}</span> outcome unknown
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
              <span className="text-win-green tnum">{ourKills}</span> we got kill
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: KIND_COLOR.our_death }}
              />
              <span className="text-crimson tnum">{ourDeaths}</span> we died
            </span>
          </div>
        )}
        <span className="text-muted">brighter marks are newer matches</span>
      </div>
    </div>
  )
}
