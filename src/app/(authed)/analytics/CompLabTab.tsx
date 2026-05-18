'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type {
  CompLabResult,
  CompEntry,
  MapStat,
  CompMatrix,
} from '@/lib/analytics'
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

export default function CompLabTab({
  result,
  defaultMap,
  allMaps,
  matrix,
}: {
  result: CompLabResult
  defaultMap: string
  allMaps: MapStat[]
  matrix: CompMatrix
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeMap = searchParams?.get('map') ?? defaultMap
  const view = searchParams?.get('view') === 'heatmap' ? 'heatmap' : 'permap'

  function changeMap(map: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', 'complab')
    params.set('map', map)
    router.push(`/analytics?${params.toString()}`)
  }

  function changeView(v: 'permap' | 'heatmap') {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', 'complab')
    if (v === 'heatmap') params.set('view', 'heatmap')
    else params.delete('view')
    router.push(`/analytics?${params.toString()}`)
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
      </div>

      {view === 'heatmap' ? (
        <HeatmapView matrix={matrix} />
      ) : (
        <>
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
