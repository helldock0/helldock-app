'use client'

import { useMemo, useState } from 'react'
import type { PlayerStat } from '@/lib/analytics'
import RatingTrendChart from '@/components/charts/RatingTrendChart'

type SortKey = 'name' | 'games' | 'avgAcs' | 'avgKd' | 'avgPlusMinus' | 'bestMap' | 'delta' | 'fk' | 'fd' | 'plants' | 'defuses' | 'adr' | 'hs'
type SortDir = 'asc' | 'desc'

const numCell = (n: number | null, suffix = '', decimals = 1) => {
  if (n === null || n === undefined) return '—'
  const v = decimals === 0 ? Math.round(n) : n
  return `${v}${suffix}`
}

export default function PlayersTab({ players }: { players: PlayerStat[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'avgAcs',
    dir: 'desc',
  })
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const rows = [...players]
    rows.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      const get = (p: PlayerStat): number | string => {
        switch (sort.key) {
          case 'name':
            return p.name.toLowerCase()
          case 'games':
            return p.games
          case 'avgAcs':
            return p.avgAcs ?? -Infinity
          case 'avgKd':
            return p.avgKd ?? -Infinity
          case 'avgPlusMinus':
            return p.avgPlusMinus ?? -Infinity
          case 'bestMap':
            return p.bestMap?.winPct ?? -Infinity
          case 'delta':
            return p.acsDelta7d ?? -Infinity
          case 'fk':
            return p.avgFk ?? -Infinity
          case 'fd':
            return p.avgFd ?? -Infinity
          case 'plants':
            return p.avgPlants ?? -Infinity
          case 'defuses':
            return p.avgDefuses ?? -Infinity
          case 'adr':
            return p.avgAdr ?? -Infinity
          case 'hs':
            return p.hsPct ?? -Infinity
        }
      }
      const av = get(a)
      const bv = get(b)
      if (av === bv) return a.name.localeCompare(b.name)
      return av > bv ? dir : -dir
    })
    return rows
  }, [players, sort])

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    )
  }

  if (players.length === 0) {
    return (
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-8 text-center text-muted text-sm">
        no player stats yet — import or log matches to populate this view
      </div>
    )
  }

  return (
    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
            <Th label="Player" k="name" sort={sort} onClick={toggleSort} align="left" />
            <Th label="G" k="games" sort={sort} onClick={toggleSort} align="center" />
            <Th label="Avg ACS" k="avgAcs" sort={sort} onClick={toggleSort} align="right" />
            <Th label="ADR" k="adr" sort={sort} onClick={toggleSort} align="right" />
            <Th label="HS%" k="hs" sort={sort} onClick={toggleSort} align="right" />
            <Th label="K/D" k="avgKd" sort={sort} onClick={toggleSort} align="right" />
            <Th label="+/−" k="avgPlusMinus" sort={sort} onClick={toggleSort} align="right" />
            <Th label="FK" k="fk" sort={sort} onClick={toggleSort} align="right" />
            <Th label="FD" k="fd" sort={sort} onClick={toggleSort} align="right" />
            <Th label="Plants" k="plants" sort={sort} onClick={toggleSort} align="right" />
            <Th label="Defuses" k="defuses" sort={sort} onClick={toggleSort} align="right" />
            <Th label="Best Map" k="bestMap" sort={sort} onClick={toggleSort} align="left" />
            <th className="text-left px-4 py-3 font-semibold">Top Agent</th>
            <Th label="7d Δ" k="delta" sort={sort} onClick={toggleSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const isExpanded = expanded === p.playerId
            return (
              <>
                <tr
                  key={p.playerId}
                  onClick={() => setExpanded(isExpanded ? null : p.playerId)}
                  className={`
                    cursor-pointer transition-colors hover:bg-surface-3
                    ${i !== sorted.length - 1 && !isExpanded ? 'border-b border-line' : ''}
                  `}
                >
                  <td className="px-4 py-3 text-fg font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-block w-1 h-1 rounded-full transition-transform ${
                          isExpanded ? 'bg-gold scale-150' : 'bg-muted-2'
                        }`}
                      />
                      {p.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted tnum">{p.games}</td>
                  <td className="px-4 py-3 text-right tnum text-fg font-medium">
                    {numCell(p.avgAcs)}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgAdr == null ? <span className="text-muted-2">—</span> : p.avgAdr}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.hsPct == null ? <span className="text-muted-2">—</span> : `${p.hsPct}%`}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgKd == null ? '—' : p.avgKd.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgPlusMinus == null
                      ? '—'
                      : p.avgPlusMinus > 0
                      ? `+${p.avgPlusMinus}`
                      : p.avgPlusMinus}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgFk == null ? <span className="text-muted-2">—</span> : p.avgFk}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgFd == null ? <span className="text-muted-2">—</span> : p.avgFd}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgPlants == null ? <span className="text-muted-2">—</span> : p.avgPlants}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.avgDefuses == null ? <span className="text-muted-2">—</span> : p.avgDefuses}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {p.bestMap ? (
                      <span>
                        {p.bestMap.map}{' '}
                        <span className="text-muted tnum text-xs">
                          {p.bestMap.winPct}%
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {p.topAgent ? (
                      <span>
                        {p.topAgent.agent}{' '}
                        <span className="text-muted tnum text-xs">×{p.topAgent.count}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tnum">
                    {p.acsDelta7d == null ? (
                      <span className="text-muted-2">—</span>
                    ) : p.acsDelta7d > 0 ? (
                      <span className="text-win-green">↑{p.acsDelta7d}</span>
                    ) : p.acsDelta7d < 0 ? (
                      <span className="text-crimson">↓{Math.abs(p.acsDelta7d)}</span>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr
                    key={`${p.playerId}-detail`}
                    className={i !== sorted.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td colSpan={14} className="bg-surface px-6 py-4 space-y-4">
                      {/* Rating trend chart */}
                      <div>
                        <div className="flex items-baseline justify-between mb-2">
                          <div className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                            Rating trend
                          </div>
                          <div className="text-2xs text-muted-2 tracking-wider">
                            (K + 0.5A) / max(D, 1) per match
                          </div>
                        </div>
                        <RatingTrendChart points={p.ratingHistory} />
                      </div>
                      {/* Advanced stats mini-grid */}
                      <div>
                        <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
                          Advanced
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <MiniCard label="Avg Rating" value={p.avgRating == null ? '—' : p.avgRating.toFixed(2)} />
                          <MiniCard label="Avg Clutches" value={p.avgClutches == null ? '—' : String(p.avgClutches)} />
                          <MiniCard label="Avg Econ" value={p.avgEcon == null ? '—' : String(p.avgEcon)} />
                        </div>
                      </div>

                      {/* Utility / behavior — V4 */}
                      <div>
                        <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
                          Utility · behavior
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          <MiniCard
                            label="Avg Util"
                            value={p.avgUtilCasts == null ? '—' : String(p.avgUtilCasts)}
                          />
                          <MiniCard label="C" value={p.avgC == null ? '—' : String(p.avgC)} />
                          <MiniCard label="Q" value={p.avgQ == null ? '—' : String(p.avgQ)} />
                          <MiniCard label="E" value={p.avgE == null ? '—' : String(p.avgE)} />
                          <MiniCard label="X (ult)" value={p.avgX == null ? '—' : String(p.avgX)} />
                          <MiniCard
                            label="AFK rds"
                            value={p.totalAfkRounds == null ? '—' : String(p.totalAfkRounds)}
                          />
                        </div>
                        {p.totalFfOutgoing != null && p.totalFfOutgoing > 0 && (
                          <p className="mt-2 text-2xs text-crimson/80">
                            FF damage dealt: {p.totalFfOutgoing}
                          </p>
                        )}
                      </div>
                      <div>
                        <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
                          Per-map ACS
                        </div>
                        {p.perMapAcs.length === 0 ? (
                          <p className="text-xs text-muted">no per-map data</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {p.perMapAcs.map((row) => (
                              <div
                                key={row.map}
                                className="bg-surface-2 rounded-md px-3 py-2 flex items-center justify-between"
                              >
                                <span className="text-xs text-fg">{row.map}</span>
                                <span className="text-xs tnum text-gold">
                                  {numCell(row.avgAcs)}
                                  <span className="text-muted-2 ml-1">×{row.games}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-md px-3 py-2.5">
      <div className="text-2xs uppercase tracking-wider text-muted-2 mb-1">{label}</div>
      <div className="text-base font-semibold text-gold tnum">{value}</div>
    </div>
  )
}

function Th({
  label,
  k,
  sort,
  onClick,
  align,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: SortDir }
  onClick: (k: SortKey) => void
  align: 'left' | 'center' | 'right'
}) {
  const active = sort.key === k
  const arrow = active ? (sort.dir === 'asc' ? '↑' : '↓') : ''
  const alignClass =
    align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'
  return (
    <th
      className={`${alignClass} px-4 py-3 font-semibold`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-gold' : 'hover:text-fg'
        }`}
      >
        {label} {arrow && <span className="text-2xs">{arrow}</span>}
      </button>
    </th>
  )
}
