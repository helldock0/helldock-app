'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { OppStat } from '@/lib/analytics'
import type { MmrLookup, MmrCacheRow } from '@/lib/henrik/mmr'

type SortKey = 'name' | 'played' | 'winPct' | 'lastMet'
type SortDir = 'asc' | 'desc'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function pickTopRank(
  riotIds: string[] | undefined,
  ranksByRiotId: Record<string, MmrLookup>
): { row: MmrCacheRow; stale: boolean } | null {
  if (!riotIds || riotIds.length === 0) return null
  let best: { row: MmrCacheRow; stale: boolean } | null = null
  for (const id of riotIds) {
    const lookup = ranksByRiotId[id]
    if (!lookup?.cached) continue
    const cur = lookup.cached
    if (
      !best ||
      (cur.current_elo ?? -1) > (best.row.current_elo ?? -1)
    ) {
      best = { row: cur, stale: lookup.stale }
    }
  }
  return best
}

function tierShortLabel(name: string | null): string {
  if (!name) return '—'
  // "Immortal 2" → "I2"; "Radiant" → "RAD"; "Bronze 1" → "B1"
  if (name === 'Radiant') return 'RAD'
  if (name === 'Unranked' || name === 'Unrated') return '—'
  const [tier, div] = name.split(' ')
  const letter = tier?.[0]?.toUpperCase() ?? '?'
  return div ? `${letter}${div}` : letter
}

function tierTone(name: string | null): string {
  if (!name) return 'text-muted-2'
  if (name.startsWith('Radiant') || name.startsWith('Immortal')) return 'text-crimson'
  if (name.startsWith('Ascendant')) return 'text-win-green'
  if (name.startsWith('Diamond') || name.startsWith('Platinum')) return 'text-gold'
  return 'text-muted'
}

export default function OppsTab({
  opps,
  riotIdsByOpp,
  ranksByRiotId,
  region,
}: {
  opps: OppStat[]
  riotIdsByOpp: Record<string, string[]>
  ranksByRiotId: Record<string, MmrLookup>
  region: string
}) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  async function handleRefresh() {
    const ids = new Set<string>()
    for (const opp of opps) {
      for (const r of riotIdsByOpp[opp.name] ?? []) ids.add(r)
    }
    if (ids.size === 0) return
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const res = await fetch('/api/mmr/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riotIds: Array.from(ids), region }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRefreshMsg(`Failed: ${data?.error ?? 'unknown error'}`)
      } else {
        setRefreshMsg(
          `Refreshed ${data.refreshed ?? 0}${data.errors?.length ? ` · ${data.errors.length} err` : ''}`
        )
        router.refresh()
      }
    } catch (e) {
      setRefreshMsg(`Failed: ${String(e)}`)
    } finally {
      setRefreshing(false)
    }
  }
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'played',
    dir: 'desc',
  })
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const rows = [...opps]
    rows.sort((a, b) => {
      const dir = sort.dir === 'asc' ? 1 : -1
      const get = (o: OppStat): number | string => {
        switch (sort.key) {
          case 'name':
            return o.name.toLowerCase()
          case 'played':
            return o.played
          case 'winPct':
            return o.winPct ?? -Infinity
          case 'lastMet':
            return o.lastMet ?? ''
        }
      }
      const av = get(a)
      const bv = get(b)
      if (av === bv) return a.name.localeCompare(b.name)
      return av > bv ? dir : -dir
    })
    return rows
  }, [opps, sort])

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    )
  }

  if (opps.length === 0) {
    return (
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-8 text-center text-muted text-sm">
        no opponents logged yet
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-3 py-1.5 text-xs rounded-md border border-line-strong/60 text-fg hover:border-gold hover:text-gold disabled:opacity-50 transition-colors"
          title="Fetch fresh MMR for every opponent's roster from Henrik (24h TTL)"
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh ranks'}
        </button>
        {refreshMsg && (
          <span className="text-2xs text-muted-2">{refreshMsg}</span>
        )}
      </div>
    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
            <Th label="Opponent" k="name" sort={sort} onClick={toggleSort} align="left" />
            <Th label="Played" k="played" sort={sort} onClick={toggleSort} align="center" />
            <th className="text-center px-4 py-3 font-semibold">Record</th>
            <Th label="Win %" k="winPct" sort={sort} onClick={toggleSort} align="right" />
            <Th label="Last Met" k="lastMet" sort={sort} onClick={toggleSort} align="left" />
            <th className="text-left px-4 py-3 font-semibold">Their Top Map</th>
            <th className="text-left px-4 py-3 font-semibold">Their Comp</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o, i) => {
            const isExpanded = expanded === o.name
            const single = o.played === 1
            return (
              <>
                <tr
                  key={o.name}
                  onClick={() => setExpanded(isExpanded ? null : o.name)}
                  className={`
                    cursor-pointer transition-colors hover:bg-surface-3
                    ${i !== sorted.length - 1 && !isExpanded ? 'border-b border-line' : ''}
                  `}
                >
                  <td className="px-4 py-3 text-fg font-medium">
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-block w-1 h-1 rounded-full transition-transform ${
                          isExpanded ? 'bg-gold scale-150' : 'bg-muted-2'
                        }`}
                      />
                      {o.name}
                      {(() => {
                        const top = pickTopRank(riotIdsByOpp[o.name], ranksByRiotId)
                        if (!top) return null
                        const label = tierShortLabel(top.row.current_tier_name)
                        const tone = tierTone(top.row.current_tier_name)
                        return (
                          <span
                            className={`text-2xs font-mono px-1.5 py-0.5 rounded border ${tone} border-current/40 bg-surface/70 ${top.stale ? 'opacity-60' : ''}`}
                            title={`${top.row.current_tier_name ?? '—'} · ${top.row.current_rr ?? '—'} RR${top.stale ? ' (stale)' : ''}`}
                          >
                            {label}
                            {top.row.current_rr != null && (
                              <span className="ml-1 text-muted-2">·{top.row.current_rr}</span>
                            )}
                          </span>
                        )
                      })()}
                      {single && (
                        <span className="text-2xs uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface border border-line text-muted-2">
                          1 match
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted tnum">{o.played}</td>
                  <td className="px-4 py-3 text-center font-mono tnum">
                    <span className="text-win-green">{o.wins}</span>
                    <span className="text-muted-2">–</span>
                    <span className="text-crimson">{o.losses}</span>
                  </td>
                  <td className="px-4 py-3 text-right tnum text-gold font-medium">
                    {o.winPct == null ? '—' : `${o.winPct}%`}
                  </td>
                  <td className="px-4 py-3 text-muted tnum">
                    {o.lastMet ? formatDate(o.lastMet) : '—'}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {o.topMap ? (
                      <span>
                        {o.topMap.map}{' '}
                        <span className="text-muted-2 tnum text-xs">×{o.topMap.count}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {o.topAgentStack.length === 0 ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span className="text-xs text-muted">
                        {o.topAgentStack.map((a) => a.agent).join(' · ')}
                      </span>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr
                    key={`${o.name}-detail`}
                    className={i !== sorted.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td colSpan={7} className="bg-surface px-6 py-4">
                      <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
                        Match history
                      </div>
                      <div className="space-y-1">
                        {o.history.map((h) => (
                          <Link
                            key={h.matchIdHelldock}
                            href={`/matches/${h.matchIdHelldock}`}
                            className="flex items-center justify-between gap-3 text-xs px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface-3 transition-colors"
                          >
                            <span className="font-mono text-gold tnum w-12">
                              {h.matchIdHelldock}
                            </span>
                            <span className="text-muted tnum w-24">{formatDate(h.date)}</span>
                            <span className="text-fg flex-1">{h.map ?? '—'}</span>
                            <span className="font-mono tnum text-fg w-16 text-right">
                              {h.ourScore != null && h.oppScore != null
                                ? `${h.ourScore} – ${h.oppScore}`
                                : '—'}
                            </span>
                            <span
                              className={`font-bold w-6 text-center ${
                                h.result === 'W'
                                  ? 'text-win-green'
                                  : h.result === 'L'
                                  ? 'text-crimson'
                                  : 'text-muted-2'
                              }`}
                            >
                              {h.result ?? '—'}
                            </span>
                          </Link>
                        ))}
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
    </>
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
