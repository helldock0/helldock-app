// Density-blob rendering for kill heatmaps. Builds SVG with one or more
// filtered groups — each group blurs its child circles with feGaussianBlur,
// then feColorMatrix thresholds low alpha to transparent and amplifies high
// alpha. Net effect: dense clusters of points become solid colored blobs,
// sparse regions disappear. No canvas, no client compute — browser-native
// + resvg-compatible so the same fragment renders in the React component
// AND the server-side Discord PNG renderer.
//
// Coords are in normalized SVG units (viewBox 0..1, matching radar overlay).

import { Fragment, type ReactElement } from 'react'

export type DensityPoint = { x: number; y: number }

export type DensityLayer = {
  /** Unique id suffix per layer in the same SVG. e.g. 'kills' / 'deaths'. */
  filterId: string
  /** Hex color like '#34d399' — drives the tint after the alpha matrix. */
  color: string
  /** The point cloud for this layer. */
  points: DensityPoint[]
}

export type DensityOpts = {
  /** Gaussian blur radius in viewBox units. Bigger = softer blob. */
  stdDeviation?: number
  /** Alpha multiplier in the colorMatrix. Higher = punchier blobs. */
  alphaMul?: number
  /** Alpha offset in the colorMatrix. More negative = more transparent in sparse regions. */
  alphaOffset?: number
  /** Pre-blur dot radius. Bigger = each point contributes a wider footprint. */
  dotRadius?: number
}

const DEFAULTS = {
  stdDeviation: 0.014,
  alphaMul: 14,
  alphaOffset: -3,
  dotRadius: 0.006,
}

/** Parse '#34d399' → { r: 0.20, g: 0.83, b: 0.60 } (each 0..1). */
function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '')
  const n = m.length === 3
    ? m.split('').map((c) => parseInt(c + c, 16))
    : [
        parseInt(m.slice(0, 2), 16),
        parseInt(m.slice(2, 4), 16),
        parseInt(m.slice(4, 6), 16),
      ]
  return { r: n[0] / 255, g: n[1] / 255, b: n[2] / 255 }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(4) : '0'
}

function filterMarkup(layer: DensityLayer, opts: Required<DensityOpts>): string {
  const { r, g, b } = hexToRgb01(layer.color)
  const rr = clamp01(r).toFixed(3)
  const gg = clamp01(g).toFixed(3)
  const bb = clamp01(b).toFixed(3)
  const mul = opts.alphaMul.toFixed(2)
  const off = opts.alphaOffset.toFixed(2)
  return (
    `<filter id="kde-${layer.filterId}" x="-10%" y="-10%" width="120%" height="120%">` +
    `<feGaussianBlur stdDeviation="${opts.stdDeviation}" />` +
    `<feColorMatrix type="matrix" values="` +
    `0 0 0 0 ${rr} ` +
    `0 0 0 0 ${gg} ` +
    `0 0 0 0 ${bb} ` +
    `0 0 0 ${mul} ${off}" />` +
    `</filter>`
  )
}

function circleMarkup(p: DensityPoint, radius: number): string {
  return `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(radius)}" fill="#ffffff" />`
}

function groupMarkup(layer: DensityLayer, opts: Required<DensityOpts>): string {
  if (layer.points.length === 0) return ''
  const circles = layer.points.map((p) => circleMarkup(p, opts.dotRadius)).join('')
  return `<g filter="url(#kde-${layer.filterId})">${circles}</g>`
}

/**
 * Build the SVG fragment string (defs + filtered groups) for a set of density
 * layers. Drop into any SVG with viewBox="0 0 1 1". Used by the server-side
 * Discord PNG renderer (resvg).
 */
export function buildDensityLayersString(
  layers: DensityLayer[],
  opts?: DensityOpts
): string {
  const merged: Required<DensityOpts> = {
    stdDeviation: opts?.stdDeviation ?? DEFAULTS.stdDeviation,
    alphaMul: opts?.alphaMul ?? DEFAULTS.alphaMul,
    alphaOffset: opts?.alphaOffset ?? DEFAULTS.alphaOffset,
    dotRadius: opts?.dotRadius ?? DEFAULTS.dotRadius,
  }
  if (layers.every((l) => l.points.length === 0)) return ''
  const defs = layers.map((l) => filterMarkup(l, merged)).join('')
  const groups = layers.map((l) => groupMarkup(l, merged)).join('')
  return `<defs>${defs}</defs>${groups}`
}

/**
 * React-friendly counterpart: returns a single JSX element you can drop
 * inside an <svg viewBox="0 0 1 1">. Internally uses dangerouslySetInnerHTML
 * because the filter/group markup is static-string-friendly and SVG elements
 * accept innerHTML cleanly. Same visual output as buildDensityLayersString.
 */
export function DensityLayers({
  layers,
  opts,
}: {
  layers: DensityLayer[]
  opts?: DensityOpts
}): ReactElement {
  const inner = buildDensityLayersString(layers, opts)
  return (
    // <g> can carry dangerouslySetInnerHTML and still be a valid SVG child.
    <g dangerouslySetInnerHTML={{ __html: inner }} />
  )
}

/** Convenience: react Fragment that renders nothing when layers are empty. */
export function DensityLayersOrEmpty(
  props: Parameters<typeof DensityLayers>[0]
): ReactElement {
  const hasAny = props.layers.some((l) => l.points.length > 0)
  if (!hasAny) return <Fragment />
  return <DensityLayers {...props} />
}
