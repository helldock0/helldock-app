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
// Every failure path returns `null` and the caller falls back to a text-only
// embed. Never throws.

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
  matchIdHelldock: string
}): Promise<Buffer | null> {
  const { mapName, killEvents, matchIdHelldock } = opts

  if (!mapName) return null
  const radar = MAP_RADARS[mapName as ValMap]
  if (!radar) return null
  if (!killEvents.length) return null

  try {
    // 1. Fetch radar PNG and convert to base64 data URL.
    const radarRes = await fetch(radar.radarUrl)
    if (!radarRes.ok) return null
    const radarBuf = Buffer.from(await radarRes.arrayBuffer())
    const radarDataUrl = `data:image/png;base64,${radarBuf.toString('base64')}`

    // 2. Plot dots — victim position (where the bullet landed), color by
    //    killer_is_ours (green = we got them, crimson = they got us). Matches
    //    the in-app "all kills" mode from MapHeatmap.tsx.
    const circles: string[] = []
    let ourKills = 0
    let ourDeaths = 0
    for (const e of killEvents) {
      if (e.victim_x == null || e.victim_y == null) continue
      const { x, y } = gameCoordToRadar(e.victim_x, e.victim_y, radar)
      if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) continue
      const color = e.killer_is_ours ? OUR_KILL_COLOR : OUR_DEATH_COLOR
      if (e.killer_is_ours) ourKills++
      else ourDeaths++
      circles.push(
        `<circle cx="${x.toFixed(4)}" cy="${y.toFixed(4)}" r="${DOT_RADIUS}" fill="${color}" opacity="${DOT_OPACITY}" />`
      )
    }

    if (circles.length === 0) return null

    // 3. Build legend text (tnum-friendly).
    const legend = `${mapName} · ${matchIdHelldock} · ${ourKills} kills / ${ourDeaths} deaths`

    // 4. Compose SVG — radar underneath, dots on top, legend strip in the
    //    bottom-left. viewBox is normalized 0-1 so all coords are unitless.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_WIDTH}" height="${OUTPUT_WIDTH}" viewBox="0 0 1 1">
  <rect x="0" y="0" width="1" height="1" fill="#0a0a0a" />
  <image href="${radarDataUrl}" x="0" y="0" width="1" height="1" opacity="${RADAR_OVERLAY_OPACITY}" preserveAspectRatio="xMidYMid slice" />
  ${circles.join('\n  ')}
  <rect x="0" y="0.94" width="1" height="0.06" fill="#000000" opacity="0.65" />
  <text x="0.012" y="0.982" font-family="Fira Code, monospace" font-size="0.028" fill="#ffffff">${escapeXml(legend)}</text>
  <circle cx="0.86" cy="0.965" r="0.01" fill="${OUR_KILL_COLOR}" />
  <text x="0.875" y="0.972" font-family="Fira Code, monospace" font-size="0.022" fill="#ffffff">kill</text>
  <circle cx="0.93" cy="0.965" r="0.01" fill="${OUR_DEATH_COLOR}" />
  <text x="0.945" y="0.972" font-family="Fira Code, monospace" font-size="0.022" fill="#ffffff">death</text>
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
