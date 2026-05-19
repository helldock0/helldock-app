// Server-side kill-heatmap PNG renderer for the Discord embed.
//
// Mirrors the SVG overlay used by the in-app modal (`MapHeatmap.tsx`) so the
// image James posts to Discord matches what he sees inside Helldock. Pipeline:
//
//   killEvents + mapName
//     → fetch radar PNG (CDN)
//     → embed as base64 data URL inside an SVG
//     → plot one circle per event (green = our kill, crimson = our death)
//     → rasterize via @resvg/resvg-js → PNG buffer
//
// No text overlay — Vercel's serverless runtime doesn't reliably ship
// fonts, and the accompanying Discord embed already carries map/score/legend
// context. Failure path returns `null`; caller falls back to text-only.

import { Resvg } from '@resvg/resvg-js'
import { MAP_RADARS, gameCoordToRadar } from '@/lib/valorant-maps'
import type { Map as ValMap } from '@/lib/valorant'

export type HeatmapKillEvent = {
  killer_x: number | null
  killer_y: number | null
  victim_x: number | null
  victim_y: number | null
  killer_is_ours: boolean | null
}

const OUTPUT_WIDTH = 800
const DOT_RADIUS = 0.012
const DOT_OPACITY = 0.85
const OUR_KILL_COLOR = '#34d399' // win-green
const OUR_DEATH_COLOR = '#ef4444' // crimson
const RADAR_OVERLAY_OPACITY = 0.7

export async function renderMatchHeatmapPng(opts: {
  mapName: string | null
  killEvents: HeatmapKillEvent[]
}): Promise<Buffer | null> {
  const { mapName, killEvents } = opts

  if (!mapName) return null
  const radar = MAP_RADARS[mapName as ValMap]
  if (!radar) return null
  if (!killEvents.length) return null

  try {
    const radarRes = await fetch(radar.radarUrl)
    if (!radarRes.ok) return null
    const radarBuf = Buffer.from(await radarRes.arrayBuffer())
    const radarDataUrl = `data:image/png;base64,${radarBuf.toString('base64')}`

    // victim position = where the bullet landed; color by killer_is_ours.
    // Matches the in-app "all kills" mode from MapHeatmap.tsx.
    const circles: string[] = []
    for (const e of killEvents) {
      if (e.victim_x == null || e.victim_y == null) continue
      const { x, y } = gameCoordToRadar(e.victim_x, e.victim_y, radar)
      if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) continue
      const color = e.killer_is_ours ? OUR_KILL_COLOR : OUR_DEATH_COLOR
      circles.push(
        `<circle cx="${x.toFixed(4)}" cy="${y.toFixed(4)}" r="${DOT_RADIUS}" fill="${color}" opacity="${DOT_OPACITY}" />`
      )
    }

    if (circles.length === 0) return null

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_WIDTH}" height="${OUTPUT_WIDTH}" viewBox="0 0 1 1">
  <rect x="0" y="0" width="1" height="1" fill="#0a0a0a" />
  <image href="${radarDataUrl}" x="0" y="0" width="1" height="1" opacity="${RADAR_OVERLAY_OPACITY}" preserveAspectRatio="xMidYMid slice" />
  ${circles.join('\n  ')}
</svg>`

    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: OUTPUT_WIDTH },
      background: '#0a0a0a',
    })
      .render()
      .asPng()

    return Buffer.from(png)
  } catch (e) {
    console.warn(
      `[discord-heatmap] render failed: ${e instanceof Error ? e.message : String(e)}`
    )
    return null
  }
}
