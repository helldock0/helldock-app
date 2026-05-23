'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type {
  CompLabResult,
  CompEntry,
  MapStat,
  CompMatrix,
} from '@/lib/analytics'
import type { SynergyMatrix, SynergyPair } from '@/lib/comp-synergy'
import { MAPS } from '@/lib/valorant'

function archetypeColor(arch: string): string {
  switch (arch) {
    case 'Standard':
      return 'bg-gold/15 text-gold border-gold/40'
    case 'Double Init':
    case 'Triple Init':
      return 'bg-blue-400/15 text-blue-300 border-blue-400/40'
    case 'Double Controller':
      return 'bg-purple-400/15 text-purple-300 border-purple-400/40'
    case 'Double Duelist':
      return 'bg-orange-400/15 text-orange-300 border-orange-400/40'
    case 'Double Sentinel':
      return 'bg-emerald-400/15 text-emerald-300 border-emerald-400/40'
    case 'No Sentinel':
    case 'No Duelist':
      return 'bg-crimson/15 text-crimson border-crimson/40'
    default:
      return 'bg-surface text-muted border-line-strong'
  }
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })
}

function Section({
  title,
  hint,
  rows,
  emptyMsg,
  accent,
}: {
  title: string
  hint: string
  rows: CompEntry[]
  emptyMsg: string
  accent: 'win-green' | 'gold' | 'crimson'
}) {
  const dot =
    accent === 'win-green' ? 'bg-win-green' : accent === 'crimson' ? 'bg-crimson' : 'bg-gold'
  return (
    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-line flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-fg/85">
          {title}
        </h3>
        <span className="text-2xs text-muted-2 uppercase tracking-wider ml-1">
          {hint}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="p-5 text-xs text-muted">{emptyMsg}</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
              <th className="text-left px-4 py-2 font-semibold">Archetype</th>
              <th className="text-left px-4 py-2 font-semibold">Agents</th>
              <th className="text-center px-3 py-2 font-semibold">G</th>
              <th className="text-center px-3 py-2 font-semibold">Record</th>
              <th className="text-right px-3 py-2 font-semibold">Win %</th>
              <th className="text-right px-3 py-2 font-semibold">Avg Δ</th>
              <th className="text-right px-4 py-2 font-semibold">Last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr
                key={e.agents.join(',')}
                className={i !== rows.length - 1 ? 'border-b border-line' : ''}
              >
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border ${archetypeColor(
                      e.archetype
                    )}`}
                  >
                    {e.archetype}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-fg text-xs">
                  {e.agents.join(' · ')}
                </td>
                <td className="px-3 py-2.5 text-center text-muted tnum">{e.played}</td>
                <td className="px-3 py-2.5 text-center font-mono tnum">
                  <span className="text-win-green">{e.wins}</span>
                  <span className="text-muted-2">–</span>
                  <span className="text-crimson">{e.losses}</span>
                </td>
                <td className="px-3 py-2.5 text-right tnum text-gold font-medium">
                  {e.winPct == null ? '—' : `${e.winPct}%`}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tnum ${
                    e.avgScoreDiff == null
                      ? 'text-muted'
                      : e.avgScoreDiff > 0
                      ? 'text-win-green'
                      : e.avgScoreDiff < 0
                      ? 'text-crimson'
                      : 'text-fg'
                  }`}
                >
                  {e.avgScoreDiff == null
                    ? '—'
                    : e.avgScoreDiff > 0
                    ? `+${e.avgScoreDiff}`
                    : e.avgScoreDiff}
                </td>
                <td className="px-4 py-2.5 text-right text-muted tnum">
                  {formatDate(e.lastPlayed)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// Color a cell based on win% — crimson (low) → muted (50) → gold (high).
// Hex literals here mirror the Tailwind tokens for inline style props:
//   muted-2 = #6B7280, gold = #FFD700, crimson rgba = (220,20,60)
// Keep in sync with tailwind.config.ts if those change.
function heatColor(winPct: number | null): { bg: string; text: string } {
  if (winPct == null) return { bg: 'transparent', text: '#6B7280' }
  // Anchor at 50%. Below → crimson tint; above → gold tint.
  if (winPct >= 50) {
    // 50 → 0.1 alpha, 100 → 0.55 alpha
    const a = 0.1 + ((winPct - 50) / 50) * 0.45
    return { bg: `rgba(255,215,0,${a.toFixed(2)})`, text: '#FFD700' }
  }
  const a = 0.1 + ((50 - winPct) / 50) * 0.45
  return { bg: `rgba(220,20,60,${a.toFixed(2)})`, text: '#FCA5A5' }
}

function HeatmapView({ matrix }: { matrix: CompMatrix }) {
  if (matrix.rows.length === 0 || matrix.maps.length === 0) {
    return (
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-8 text-center text-muted text-sm">
        no comp data across maps yet
      </div>
    )
  }
  return (
    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-line flex items-center gap-3">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold" />
        <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-fg/85">
          Comp × Map heatmap
        </h3>
        <span className="text-2xs text-muted-2 uppercase tracking-wider ml-1">
          win% · crimson → gold
        </span>
        <span className="ml-auto text-2xs text-muted-2 tracking-wider">
          {matrix.rows.length} comps · {matrix.maps.length} maps
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
              <th className="text-left px-4 py-2 font-semibold sticky left-0 bg-surface-2 z-10 min-w-[260px]">
                Comp
              </th>
              <th className="text-center px-2 py-2 font-semibold">G</th>
              {matrix.maps.map((m) => (
                <th key={m} className="text-center px-2 py-2 font-semibold">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, i) => {
              const overall =
                row.totalPlayed > 0
                  ? Math.round((row.totalWins / row.totalPlayed) * 1000) / 10
                  : null
              return (
                <tr
                  key={row.agents.join(',')}
                  className={i !== matrix.rows.length - 1 ? 'border-b border-line' : ''}
                >
                  <td className="px-4 py-2 sticky left-0 bg-surface-2 z-10">
                    <div className="text-fg text-xs leading-snug">
                      {row.agents.join(' · ')}
                    </div>
                    <div className="text-2xs text-muted-2 uppercase tracking-wider mt-0.5">
                      {row.archetype}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center tnum">
                    <span className="text-fg">{row.totalPlayed}</span>
                    {overall != null && (
                      <span
                        className={`block text-2xs ${
                          overall >= 50 ? 'text-gold' : 'text-crimson'
                        }`}
                      >
                        {overall}%
                      </span>
                    )}
                  </td>
                  {matrix.maps.map((m) => {
                    const cell = row.cells[m]
                    if (!cell || cell.total === 0) {
                      return (
                        <td key={m} className="px-2 py-2 text-center text-muted-2/40">
                          —
                        </td>
                      )
                    }
                    const c = heatColor(cell.winPct)
                    return (
                      <td
                        key={m}
                        className="px-2 py-2 text-center align-middle"
                        title={`${m} · ${cell.wins}-${cell.losses} (${cell.winPct ?? '—'}%)`}
                      >
                        <div
                          className="rounded-md px-2 py-1.5 inline-flex flex-col items-center justify-center min-w-[3rem]"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          <span className="font-mono tnum text-xs leading-none">
                            {cell.wins}-{cell.losses}
                          </span>
                          {cell.winPct != null && (
                            <span className="text-2xs tnum opacity-80 mt-0.5">
                              {cell.winPct}%
                            </span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Color a synergy lift cell. Lift = pair W% − mean(solo W%s), in pp.
// Strongly positive = duo overperforms; negative = anti-synergy.
function liftColor(lift: number | null): { bg: string; text: string } {
  if (lift == null) return { bg: 'transparent', text: '#6B7280' }
  if (lift >= 0) {
    // 0 → 0.1 alpha; +25pp → 0.6
    const a = Math.min(0.6, 0.1 + (lift / 25) * 0.5)
    return { bg: `rgba(52,211,153,${a.toFixed(2)})`, text: '#34D399' }
  }
  const a = Math.min(0.6, 0.1 + (-lift / 25) * 0.5)
  return { bg: `rgba(220,20,60,${a.toFixed(2)})`, text: '#FCA5A5' }
}

// B4 — Compact "top synergies / anti-synergies" strip surfaced on the default
// (per-map) view. Pulls the highest- and lowest-lift pairs above the minSample
// threshold so synergy doesn't stay buried 3 clicks deep.
function SynergyHighlightsStrip({
  synergy,
  onSeeAll,
}: {
  synergy: SynergyMatrix
  onSeeAll: () => void
}) {
  const withLift = synergy.pairs.filter((p) => p.liftPp != null) as Array<
    SynergyPair & { liftPp: number }
  >
  if (withLift.length < 2) return null

  const byLift = [...withLift].sort((a, b) => b.liftPp - a.liftPp)
  const top = byLift.slice(0, 3)
  const bottom = byLift.slice(-3).reverse()
  // If top and bottom collide (small dataset), don't render — synergy view itself is enough.
  if (top.length === 0 || top[0].liftPp <= 0) return null

  return (
    <button
      type="button"
      onClick={onSeeAll}
      className="
        group block w-full text-left bg-surface-2 border border-line-strong/40 rounded-2xl
        px-5 py-4 transition-colors hover:border-gold/40 hover:bg-surface-3
      "
    >
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-2xs uppercase tracking-[0.18em] text-muted-2">
          Pair synergy snapshot · n ≥ {synergy.minSample}
        </span>
        <span className="text-2xs uppercase tracking-wider text-muted-2 group-hover:text-gold transition-colors">
          see all →
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-2xs uppercase tracking-wider text-win-green/90 mb-1.5">
            Top synergies
          </div>
          <ul className="space-y-1 text-sm">
            {top.map((p) => (
              <li
                key={`top-${p.a}-${p.b}`}
                className="flex items-center justify-between gap-3 tnum"
              >
                <span className="text-fg truncate">
                  {p.a} <span className="text-muted-2">+</span> {p.b}
                </span>
                <span className="shrink-0 text-win-green font-semibold">
                  +{p.liftPp}pp
                  <span className="text-muted-2 text-2xs ml-1">n={p.total}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-wider text-crimson/80 mb-1.5">
            Anti-synergies
          </div>
          {bottom.filter((p) => p.liftPp < 0).length === 0 ? (
            <p className="text-xs text-muted-2">none — all duos overperform their solo baseline</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {bottom
                .filter((p) => p.liftPp < 0)
                .map((p) => (
                  <li
                    key={`bot-${p.a}-${p.b}`}
                    className="flex items-center justify-between gap-3 tnum"
                  >
                    <span className="text-fg truncate">
                      {p.a} <span className="text-muted-2">+</span> {p.b}
                    </span>
                    <span className="shrink-0 text-crimson font-semibold">
                      {p.liftPp}pp
                      <span className="text-muted-2 text-2xs ml-1">n={p.total}</span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </button>
  )
}

function SynergyView({ synergy }: { synergy: SynergyMatrix }) {
  if (synergy.agents.length < 2) {
    return (
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-8 text-center text-muted text-sm">
        need 2+ agents across logged matches to compute synergy
      </div>
    )
  }

  // Top pairs (sorted by total, already filtered to n≥minSample) — small
  // ranked list above the grid for quick read.
  const top = synergy.pairs.slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center gap-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-win-green" />
          <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-fg/85">
            Top pairs · lift over solo baselines
          </h3>
          <span className="ml-auto text-2xs text-muted-2 tracking-wider">
            n ≥ {synergy.minSample}
          </span>
        </div>
        {top.length === 0 ? (
          <div className="p-5 text-xs text-muted">
            not enough matches yet — need pairs that played together ≥{' '}
            {synergy.minSample} times
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
                <th className="text-left px-4 py-2 font-semibold">Pair</th>
                <th className="text-center px-3 py-2 font-semibold">G</th>
                <th className="text-right px-3 py-2 font-semibold">Record</th>
                <th className="text-right px-3 py-2 font-semibold">Pair W%</th>
                <th className="text-right px-3 py-2 font-semibold">Solo avg</th>
                <th className="text-right px-4 py-2 font-semibold">Lift</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => {
                const soloMean =
                  p.soloAWinPct != null && p.soloBWinPct != null
                    ? Math.round(((p.soloAWinPct + p.soloBWinPct) / 2) * 10) / 10
                    : null
                return (
                  <tr
                    key={`${p.a}|${p.b}`}
                    className={i !== top.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td className="px-4 py-2 text-fg">
                      {p.a} · {p.b}
                    </td>
                    <td className="px-3 py-2 text-center text-muted tnum">
                      {p.total}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tnum">
                      <span className="text-win-green">{p.wins}</span>
                      <span className="text-muted-2">–</span>
                      <span className="text-crimson">{p.losses}</span>
                    </td>
                    <td className="px-3 py-2 text-right tnum text-gold font-medium">
                      {p.winPct == null ? '—' : `${p.winPct}%`}
                    </td>
                    <td className="px-3 py-2 text-right tnum text-muted">
                      {soloMean == null ? '—' : `${soloMean}%`}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tnum font-semibold ${
                        p.liftPp == null
                          ? 'text-muted-2'
                          : p.liftPp >= 5
                          ? 'text-win-green'
                          : p.liftPp <= -5
                          ? 'text-crimson'
                          : 'text-fg'
                      }`}
                    >
                      {p.liftPp == null
                        ? '—'
                        : `${p.liftPp > 0 ? '+' : ''}${p.liftPp}pp`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pairwise grid — diagonal = solo W%, cells = pair W% colored by lift */}
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center gap-3">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gold" />
          <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-fg/85">
            Pairwise grid
          </h3>
          <span className="text-2xs text-muted-2 uppercase tracking-wider ml-1">
            diagonal = solo · cell = pair W% · color = lift
          </span>
          <span className="ml-auto text-2xs text-muted-2 tracking-wider">
            {synergy.agents.length} agents
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-surface-2 z-10 min-w-[120px]">
                  Agent
                </th>
                {synergy.agents.map((a) => (
                  <th
                    key={a}
                    className="px-2 py-2 font-semibold text-center min-w-[68px]"
                  >
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {synergy.agents.map((rowAgent, i) => {
                const solo = synergy.soloByAgent[rowAgent]
                return (
                  <tr
                    key={rowAgent}
                    className={i !== synergy.agents.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td className="px-3 py-2 sticky left-0 bg-surface-2 z-10">
                      <div className="text-fg">{rowAgent}</div>
                      <div className="text-2xs text-muted-2 tnum">
                        n={solo?.total ?? 0}
                      </div>
                    </td>
                    {synergy.agents.map((colAgent) => {
                      if (colAgent === rowAgent) {
                        return (
                          <td
                            key={colAgent}
                            className="px-2 py-2 text-center text-muted tnum bg-surface-3/30"
                            title={`${rowAgent} solo W%`}
                          >
                            <span className="text-fg/90">
                              {solo?.winPct == null ? '—' : `${solo.winPct}%`}
                            </span>
                          </td>
                        )
                      }
                      const cell: SynergyPair | undefined =
                        synergy.cells[rowAgent]?.[colAgent]
                      if (!cell || cell.total === 0) {
                        return (
                          <td
                            key={colAgent}
                            className="px-2 py-2 text-center text-muted-2/40"
                          >
                            —
                          </td>
                        )
                      }
                      const c = liftColor(cell.liftPp)
                      return (
                        <td
                          key={colAgent}
                          className="px-1.5 py-1.5 text-center"
                          title={`${rowAgent}+${colAgent} · ${cell.wins}-${cell.losses} · pair ${cell.winPct ?? '—'}% · lift ${cell.liftPp == null ? '—' : cell.liftPp + 'pp'}`}
                        >
                          <div
                            className="rounded-md px-1.5 py-1 inline-flex flex-col items-center min-w-[3rem]"
                            style={{ backgroundColor: c.bg, color: c.text }}
                          >
                            <span className="font-mono tnum leading-none">
                              {cell.winPct == null ? '—' : `${cell.winPct}%`}
                            </span>
                            <span className="text-2xs tnum opacity-70 mt-0.5">
                              n={cell.total}
                            </span>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

type ViewKind = 'permap' | 'heatmap' | 'synergy'

export default function CompLabTab({
  result,
  defaultMap,
  allMaps,
  matrix,
  synergy,
}: {
  result: CompLabResult
  defaultMap: string
  allMaps: MapStat[]
  matrix: CompMatrix
  synergy: SynergyMatrix
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeMap = searchParams?.get('map') ?? defaultMap
  const viewParam = searchParams?.get('view') ?? ''
  const view: ViewKind =
    viewParam === 'heatmap'
      ? 'heatmap'
      : viewParam === 'synergy'
      ? 'synergy'
      : 'permap'

  function changeMap(map: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', 'complab')
    params.set('map', map)
    router.push(`/app/analytics?${params.toString()}`)
  }

  function changeView(v: ViewKind) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', 'complab')
    if (v === 'permap') params.delete('view')
    else params.set('view', v)
    router.push(`/app/analytics?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* View toggle + map selector */}
      <div className="flex flex-wrap items-center gap-3 bg-surface-2 border border-line-strong/40 rounded-2xl p-4">
        <div className="inline-flex rounded-md border border-line-strong overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => changeView('permap')}
            className={`px-3 py-1.5 transition-colors ${
              view === 'permap'
                ? 'bg-gold text-black font-semibold'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Per-map
          </button>
          <button
            type="button"
            onClick={() => changeView('heatmap')}
            className={`px-3 py-1.5 transition-colors border-l border-line-strong ${
              view === 'heatmap'
                ? 'bg-gold text-black font-semibold'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Heatmap
          </button>
          <button
            type="button"
            onClick={() => changeView('synergy')}
            className={`px-3 py-1.5 transition-colors border-l border-line-strong ${
              view === 'synergy'
                ? 'bg-gold text-black font-semibold'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            Synergy
          </button>
        </div>

        {view === 'permap' && (
          <>
            <label className="text-2xs uppercase tracking-[0.16em] text-muted-2 ml-2">
              Map
            </label>
            <select
              value={activeMap}
              onChange={(e) => changeMap(e.target.value)}
              className="bg-surface border border-line-strong text-fg rounded-md px-3 py-1.5 text-sm hover:border-gold/60 transition-colors"
            >
              {MAPS.map((m) => {
                const stat = allMaps.find((x) => x.map === m)
                const games = stat?.total ?? 0
                return (
                  <option key={m} value={m}>
                    {m} {games > 0 ? `(${games})` : ''}
                  </option>
                )
              })}
            </select>
            <p className="ml-auto text-2xs text-muted-2 uppercase tracking-wider">
              {result.winners.length + result.experimental.length + result.losers.length}{' '}
              unique comps on {activeMap}
            </p>
          </>
        )}

        {view === 'heatmap' && (
          <p className="ml-auto text-2xs text-muted-2 uppercase tracking-wider">
            cross-map performance · hover a cell for record
          </p>
        )}

        {view === 'synergy' && (
          <p className="ml-auto text-2xs text-muted-2 uppercase tracking-wider">
            pair W% vs each player&apos;s solo baseline
          </p>
        )}
      </div>

      {view === 'heatmap' ? (
        <HeatmapView matrix={matrix} />
      ) : view === 'synergy' ? (
        <SynergyView synergy={synergy} />
      ) : (
        <>
          <SynergyHighlightsStrip
            synergy={synergy}
            onSeeAll={() => changeView('synergy')}
          />
          <Section
            title="Winners"
            hint="≥60% on 3+"
            rows={result.winners}
            emptyMsg="no comp with 3+ games above 60% on this map yet"
            accent="win-green"
          />
          <Section
            title="Experimental"
            hint="1–2 games · or 40–60%"
            rows={result.experimental}
            emptyMsg="no experimental comps yet"
            accent="gold"
          />
          <Section
            title="Losers"
            hint="<40% on 3+ · stop running"
            rows={result.losers}
            emptyMsg="no comp with 3+ games below 40% — keep it that way"
            accent="crimson"
          />
        </>
      )}
    </div>
  )
}
