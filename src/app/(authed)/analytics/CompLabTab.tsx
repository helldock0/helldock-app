'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { CompLabResult, CompEntry, MapStat } from '@/lib/analytics'
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

export default function CompLabTab({
  result,
  defaultMap,
  allMaps,
}: {
  result: CompLabResult
  defaultMap: string
  allMaps: MapStat[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeMap = searchParams?.get('map') ?? defaultMap

  function changeMap(map: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', 'complab')
    params.set('map', map)
    router.push(`/analytics?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Map selector */}
      <div className="flex items-center gap-3 bg-surface-2 border border-line-strong/40 rounded-2xl p-4">
        <label className="text-2xs uppercase tracking-[0.16em] text-muted-2">
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
      </div>

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
    </div>
  )
}
