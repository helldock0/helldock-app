// Small static kill-position heatmaps for the dossier overview — no filters,
// no toggles, just the radar with a dot per kill. For the full interactive
// heatmap (filters, density, side toggles), use components/maps/MapHeatmap.

import { MAP_RADARS, gameCoordToRadar } from '@/lib/valorant-maps'
import type { Map as ValMap } from '@/lib/valorant'

export type DossierKill = {
  killer_x: number | null
  killer_y: number | null
  victim_x: number | null
  victim_y: number | null
  // killer_is_ours represents the focal player's perspective: was THEIR puuid
  // the killer (true → we plot a kill dot at the victim) or the victim
  // (false → we plot a death dot at the victim).
  isKill: boolean
}

export type DossierMapTile = {
  mapName: ValMap
  played: number
  kills: DossierKill[]
}

const KILL_COLOR = '#34D399'   // win-green
const DEATH_COLOR = '#DC143C'  // crimson

function Tile({ tile }: { tile: DossierMapTile }) {
  const radar = MAP_RADARS[tile.mapName]
  const dots: { x: number; y: number; kill: boolean }[] = []
  if (radar) {
    for (const k of tile.kills) {
      const cx = k.victim_x
      const cy = k.victim_y
      if (cx == null || cy == null) continue
      const { x, y } = gameCoordToRadar(cx, cy, radar)
      if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) continue
      dots.push({ x, y, kill: k.isKill })
    }
  }
  const kills = dots.filter((d) => d.kill).length
  const deaths = dots.length - kills

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-2xs uppercase tracking-wider text-muted-2">
        <span className="text-fg font-medium normal-case tracking-normal text-xs">
          {tile.mapName}
        </span>
        <span className="tnum">
          <span className="text-win-green">{kills}</span>
          <span className="mx-1 text-muted-2/60">/</span>
          <span className="text-crimson">{deaths}</span>
          <span className="ml-2 text-muted-2">n{tile.played}</span>
        </span>
      </div>
      <div className="relative aspect-square w-full bg-black rounded-md overflow-hidden border border-line">
        {radar ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={radar.radarUrl}
              alt={`${tile.mapName} radar`}
              className="absolute inset-0 w-full h-full object-cover opacity-60"
            />
            <svg
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
              aria-label={`${tile.mapName} kill heatmap`}
            >
              {dots.map((d, i) => (
                <circle
                  key={i}
                  cx={d.x}
                  cy={d.y}
                  r={0.013}
                  fill={d.kill ? KILL_COLOR : DEATH_COLOR}
                  fillOpacity={0.55}
                  stroke={d.kill ? KILL_COLOR : DEATH_COLOR}
                  strokeOpacity={0.85}
                  strokeWidth={0.002}
                />
              ))}
            </svg>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-2xs text-muted-2">
            no radar
          </div>
        )}
      </div>
    </div>
  )
}

export default function PitchHeatmapStrip({ tiles }: { tiles: DossierMapTile[] }) {
  if (tiles.length === 0) {
    return <p className="text-sm text-muted-2">no kill data yet</p>
  }
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Tile key={t.mapName} tile={t} />
        ))}
      </div>
      <p className="mt-3 text-2xs uppercase tracking-wider text-muted-2">
        <span className="inline-block w-2 h-2 rounded-full bg-win-green mr-1.5 align-middle" />
        kills
        <span className="inline-block w-2 h-2 rounded-full bg-crimson ml-3 mr-1.5 align-middle" />
        deaths · dots at victim position
      </p>
    </div>
  )
}
