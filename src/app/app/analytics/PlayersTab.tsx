'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { PlayerStat } from '@/lib/analytics'
import RatingTrendChart from '@/components/charts/RatingTrendChart'
import { formatOpponentName } from '@/lib/opponent-name'
import PlayerComparePanel from './PlayerComparePanel'

const EXPAND_HINT_KEY = 'helldock.playersTab.expandHintDismissed'

type SortKey = 'name' | 'games' | 'avgAcs' | 'avgKd' | 'avgPlusMinus' | 'bestMap' | 'delta' | 'fk' | 'fd' | 'plants' | 'defuses' | 'adr' | 'hs' | 'trade' | 'drag' | 'carry' | 'kst' | 'opduel' | 'rating2' | 'twok' | 'acsStdev' | 'postPlant' | 'lev'
type SortDir = 'asc' | 'desc'
type FocusKey = 'standard' | 'consistency' | 'plant'

const FOCUS_PRESETS: Record<FocusKey, { key: SortKey; dir: SortDir; label: string }> = {
  standard: { key: 'avgAcs', dir: 'desc', label: 'Standard' },
  consistency: { key: 'acsStdev', dir: 'asc', label: 'Consistency' },
  plant: { key: 'postPlant', dir: 'desc', label: 'Plant timing' },
}

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
  const [showExpandHint, setShowExpandHint] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (!window.localStorage.getItem(EXPAND_HINT_KEY)) setShowExpandHint(true)
    } catch {
      // localStorage blocked — silently skip the hint
    }
  }, [])

  function dismissExpandHint() {
    setShowExpandHint(false)
    try {
      window.localStorage.setItem(EXPAND_HINT_KEY, '1')
    } catch {
      // ignore — hint just stays visible next mount
    }
  }

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
          case 'trade':
            return p.tradeRate ?? -Infinity
          case 'drag':
            return p.drag ?? -Infinity
          case 'carry':
            return p.carry ?? -Infinity
          case 'kst':
            return p.kstPct ?? -Infinity
          case 'opduel':
            return p.opDuelWPct ?? -Infinity
          case 'rating2':
            return p.rating2 ?? -Infinity
          case 'twok':
            return p.twoKWinPct ?? -Infinity
          case 'acsStdev':
            // Players with no stdev sort to the bottom for asc (most-consistent first).
            return p.acsStdev ?? Infinity
          case 'postPlant':
            return p.postPlantKills ?? -Infinity
          case 'lev':
            return p.levCarry ?? -Infinity
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

  function applyFocus(focus: FocusKey) {
    const preset = FOCUS_PRESETS[focus]
    setSort({ key: preset.key, dir: preset.dir })
  }
  const activeFocus: FocusKey =
    sort.key === 'acsStdev' ? 'consistency' : sort.key === 'postPlant' ? 'plant' : 'standard'

  if (players.length === 0) {
    return (
      <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-8 text-center text-muted text-sm">
        no player stats yet — import or log matches to populate this view
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <PlayerComparePanel players={players} />

      {showExpandHint && (
        <div className="flex items-center justify-between gap-3 bg-gold/8 border border-gold/30 rounded-xl px-4 py-2.5">
          <p className="text-xs text-fg">
            <span className="text-gold font-semibold">tip:</span> click any player row to expand
            an advanced drawer — KPR, survive %, ACS stdev, pre/post-plant split, per-map ACS, full rating trend.
          </p>
          <button
            type="button"
            onClick={dismissExpandHint}
            className="shrink-0 text-2xs uppercase tracking-wider text-muted-2 hover:text-gold transition-colors"
          >
            got it ✕
          </button>
        </div>
      )}
      {/* Focus presets — switch sort to surface specific metric families */}
      <div className="flex flex-wrap items-center gap-3 bg-surface-2 border border-line-strong/40 rounded-2xl px-4 py-3">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">Focus</span>
        <div className="flex items-center gap-1.5">
          {(Object.keys(FOCUS_PRESETS) as FocusKey[]).map((f) => {
            const active = activeFocus === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => applyFocus(f)}
                className={`
                  text-2xs uppercase tracking-[0.14em] px-2.5 py-1 rounded-md transition-colors
                  ${active
                    ? 'bg-gold/15 text-gold border border-gold/40'
                    : 'bg-surface text-muted border border-line hover:text-fg hover:border-line-strong'}
                `}
              >
                {FOCUS_PRESETS[f].label}
              </button>
            )
          })}
        </div>
        <span className="ml-auto text-2xs text-muted-2 tracking-wider">
          {activeFocus === 'consistency'
            ? 'sorted by ACS stdev · lower = more consistent'
            : activeFocus === 'plant'
            ? 'sorted by post-plant kills · higher = stronger in retake / hold'
            : 'sort by any column · click row for advanced drawer'}
        </span>
      </div>

    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap min-w-[1750px]">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
            <Th label="Player" k="name" sort={sort} onClick={toggleSort} align="left" />
            <Th label="G" k="games" sort={sort} onClick={toggleSort} align="center" tooltip="Games played in scope." />
            <Th label="Avg ACS" k="avgAcs" sort={sort} onClick={toggleSort} align="right" tooltip="Average Combat Score per game — Riot's overall impact stat. Higher = better." />
            <Th label="ADR" k="adr" sort={sort} onClick={toggleSort} align="right" tooltip="Average Damage per Round, averaged across games." />
            <Th label="HS%" k="hs" sort={sort} onClick={toggleSort} align="right" tooltip="Headshot percentage. % of your kills that were headshots." />
            <Th label="K/D" k="avgKd" sort={sort} onClick={toggleSort} align="right" tooltip="Kills divided by deaths, averaged per game. 1.0 = breaking even." />
            <Th label="+/−" k="avgPlusMinus" sort={sort} onClick={toggleSort} align="right" tooltip="Average kill differential per game (kills minus deaths)." />
            <Th label="FK" k="fk" sort={sort} onClick={toggleSort} align="right" tooltip="First Kills — average per game where you got the opening kill of a round." />
            <Th label="FD" k="fd" sort={sort} onClick={toggleSort} align="right" tooltip="First Deaths — average per game where you took the opening death of a round." />
            <Th label="Plants" k="plants" sort={sort} onClick={toggleSort} align="right" tooltip="Average bomb plants per game." />
            <Th label="Defuses" k="defuses" sort={sort} onClick={toggleSort} align="right" tooltip="Average bomb defuses per game." />
            <Th label="Best Map" k="bestMap" sort={sort} onClick={toggleSort} align="left" tooltip="Your map with the highest win-rate (minimum 2 games)." />
            <th className="text-left px-4 py-3 font-semibold">Top Agent</th>
            <Th label="7d Δ" k="delta" sort={sort} onClick={toggleSort} align="right" tooltip="Recent form: your last-7-days ACS minus your all-time ACS. Green = you're heating up." />
            <Th label="Trade%" k="trade" sort={sort} onClick={toggleSort} align="right" tooltip="Of the rounds where you died, % where a teammate killed your killer within 5 seconds. Higher = team plays around you well." />
            <Th label="Drag" k="drag" sort={sort} onClick={toggleSort} align="right" tooltip="How much our round-loss rate goes UP when you die vs when you stay alive (in percentage points, 'pp'). High = the team can't function without you alive." />
            <Th label="Carry" k="carry" sort={sort} onClick={toggleSort} align="right" tooltip="How much our round-win rate goes UP in rounds where you got ≥1 kill vs rounds you got zero (in percentage points, 'pp'). High = your fragging directly wins rounds." />
            <Th label="Lev" k="lev" sort={sort} onClick={toggleSort} align="right" tooltip="WP-weighted leverage carry. Sum across moments (multikills, clutches, opening duels) weighted by how surprising the round outcome was. A 1v3 in a 5%-WP round is worth ~26× a 3K in a 95%-WP round. Click the row to see top moments." />
            <Th label="KST%" k="kst" sort={sort} onClick={toggleSort} align="right" tooltip="Kill, Survive, or Traded — % of rounds where you contributed (got a kill, stayed alive, OR your death was traded back by a teammate). Consistency metric. 70%+ is good." />
            <Th label="OpDuel" k="opduel" sort={sort} onClick={toggleSort} align="right" tooltip="Opening-duel win rate. When the first kill of a round involved you (your kill OR your death), how often you came out on top." />
            <Th label="2K W%" k="twok" sort={sort} onClick={toggleSort} align="right" tooltip="In rounds where you got 2+ kills, % of those rounds we actually won. High = your multi-kills convert into round wins." />
            <Th label="Rating" k="rating2" sort={sort} onClick={toggleSort} align="right" tooltip="HLTV-style Rating 2.0 — weighted blend of kills/round, survival/round, and KST. 1.00 ≈ pro average. Above 1 = above average." />
            <Th label="ACS σ" k="acsStdev" sort={sort} onClick={toggleSort} align="right" tooltip="ACS standard deviation across matches. Lower = more consistent performer. CV in parens = stdev as % of mean. Cv < 20% = steady; > 35% = streaky." />
            <Th label="PrePlant" k="postPlant" sort={sort} onClick={toggleSort} align="right" tooltip="Pre-plant kills total (before bomb planted). Sorts by post-plant — use this column header to see split: pre / post." />
            <Th label="PostPlant" k="postPlant" sort={sort} onClick={toggleSort} align="right" tooltip="Post-plant kills total (after bomb planted). High = strong in retake / hold phase. Sort active here." />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const isExpanded = expanded === p.playerId
            return (
              <Fragment key={p.playerId}>
                <tr
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
                      <Link
                        href={`/app/players/${encodeURIComponent(p.playerId)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-2xs text-muted-2 hover:text-gold transition-colors uppercase tracking-wider"
                        title="Open player profile"
                      >
                        profile →
                      </Link>
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
                  {/* S16 — impact metrics */}
                  <td
                    className="px-4 py-3 text-right tnum text-fg"
                    title={
                      p.tradeRate == null
                        ? 'No puuid data yet — re-import or rehydrate the match'
                        : `${p.deathsTraded} of ${p.totalDeathsTracked} deaths traded within 5s`
                    }
                  >
                    {p.tradeRate == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={
                          p.tradeRate >= 60
                            ? 'text-win-green'
                            : p.tradeRate < 35
                            ? 'text-crimson'
                            : 'text-fg'
                        }
                      >
                        {p.tradeRate}%
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.drag == null
                        ? 'Not enough data'
                        : `Loss% when dead: ${p.lossPctWhenDead ?? '?'}% (n=${p.diedSample}) vs alive: ${p.lossPctWhenAlive ?? '?'}% (n=${p.aliveSample})`
                    }
                  >
                    {p.drag == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={`font-semibold ${
                          p.drag >= 15
                            ? 'text-crimson'
                            : p.drag >= 5
                            ? 'text-gold'
                            : p.drag <= -5
                            ? 'text-win-green'
                            : 'text-fg'
                        }`}
                      >
                        {p.drag > 0 ? '+' : ''}
                        {p.drag}pp
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.carry == null
                        ? 'Not enough data'
                        : `Win% with kill: ${p.winPctWithKill ?? '?'}% (n=${p.hadKillSample}) vs no kill: ${p.winPctWithoutKill ?? '?'}% (n=${p.noKillSample})`
                    }
                  >
                    {p.carry == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={`font-semibold ${
                          p.carry >= 15
                            ? 'text-win-green'
                            : p.carry >= 5
                            ? 'text-gold'
                            : p.carry <= -5
                            ? 'text-crimson'
                            : 'text-fg'
                        }`}
                      >
                        {p.carry > 0 ? '+' : ''}
                        {p.carry}pp
                      </span>
                    )}
                  </td>
                  {/* S26 — Leverage carry (WP-weighted moment score) */}
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.levCarry == null
                        ? 'WP model not trained yet (need ≥30 rounds)'
                        : `${p.levMoments} moments captured. Expand row to see top 3.`
                    }
                  >
                    {p.levCarry == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={`font-semibold ${
                          p.levCarry >= 2
                            ? 'text-win-green'
                            : p.levCarry >= 0.5
                            ? 'text-gold'
                            : p.levCarry <= -0.5
                            ? 'text-crimson'
                            : 'text-fg'
                        }`}
                      >
                        {p.levCarry > 0 ? '+' : ''}
                        {p.levCarry.toFixed(2)}
                      </span>
                    )}
                  </td>
                  {/* S17 — advanced metrics */}
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.kstPct == null
                        ? 'No data'
                        : `Got a kill, survived, or trade-deathed in ${p.kstPct}% of ${p.kstSample} rounds. Assists not counted — Henrik doesn't expose per-round damage.`
                    }
                  >
                    {p.kstPct == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={
                          p.kstPct >= 70
                            ? 'text-win-green'
                            : p.kstPct >= 60
                            ? 'text-gold'
                            : p.kstPct < 50
                            ? 'text-crimson'
                            : 'text-fg'
                        }
                      >
                        {p.kstPct}%
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.opDuelWPct == null
                        ? 'No first-blood data'
                        : `Won ${p.opDuelWins} of ${p.opDuelWins + p.opDuelLosses} opening duels`
                    }
                  >
                    {p.opDuelWPct == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={
                          p.opDuelWPct >= 60
                            ? 'text-win-green'
                            : p.opDuelWPct < 40
                            ? 'text-crimson'
                            : 'text-fg'
                        }
                      >
                        {p.opDuelWPct}%
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.twoKWinPct == null
                        ? 'No 2K rounds yet'
                        : `Won ${Math.round((p.twoKWinPct / 100) * p.twoKSample)} of ${p.twoKSample} rounds where you got exactly 2 kills`
                    }
                  >
                    {p.twoKWinPct == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={
                          p.twoKWinPct >= 75
                            ? 'text-win-green'
                            : p.twoKWinPct < 50
                            ? 'text-crimson'
                            : 'text-fg'
                        }
                      >
                        {p.twoKWinPct}%
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.rating2 == null
                        ? 'No data'
                        : `Weighted blend of KPR (${p.rating2KillsPerRound ?? '?'}/rd), survival (${p.rating2SurvivalRate ?? '?'}/rd), and KST (${p.kstPct ?? '?'}%). 1.00 ≈ pro avg.`
                    }
                  >
                    {p.rating2 == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={`font-bold ${
                          p.rating2 >= 1.1
                            ? 'text-win-green'
                            : p.rating2 >= 0.95
                            ? 'text-gold'
                            : p.rating2 < 0.8
                            ? 'text-crimson'
                            : 'text-fg'
                        }`}
                      >
                        {p.rating2.toFixed(2)}
                      </span>
                    )}
                  </td>
                  {/* B3 — surface previously drawer-only metrics */}
                  <td
                    className="px-4 py-3 text-right tnum"
                    title={
                      p.acsStdev == null
                        ? 'Not enough games for stdev'
                        : `Stdev ${p.acsStdev} ACS across ${p.games} matches${p.acsCv != null ? ` (cv ${p.acsCv}%)` : ''}. Lower = steadier.`
                    }
                  >
                    {p.acsStdev == null ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      <span
                        className={
                          p.acsCv != null && p.acsCv < 20
                            ? 'text-win-green'
                            : p.acsCv != null && p.acsCv > 35
                            ? 'text-crimson'
                            : 'text-fg'
                        }
                      >
                        {p.acsStdev}
                        {p.acsCv != null && (
                          <span className="text-muted-2 text-2xs ml-1">({p.acsCv}%)</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.prePlantKills === 0 && p.postPlantKills === 0 ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      p.prePlantKills
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tnum text-fg">
                    {p.prePlantKills === 0 && p.postPlantKills === 0 ? (
                      <span className="text-muted-2">—</span>
                    ) : (
                      p.postPlantKills
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr
                    key={`${p.playerId}-detail`}
                    className={i !== sorted.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td colSpan={25} className="bg-surface px-6 py-4 space-y-4">
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
                          <MiniCard label="Old Rating" value={p.avgRating == null ? '—' : p.avgRating.toFixed(2)} />
                          <MiniCard label="Avg Clutches" value={p.avgClutches == null ? '—' : String(p.avgClutches)} />
                          <MiniCard label="Avg Econ" value={p.avgEcon == null ? '—' : String(p.avgEcon)} />
                        </div>
                      </div>

                      {/* S26 — Top leverage moments */}
                      {p.topLeverageMoments.length > 0 && (
                        <div>
                          <div className="flex items-baseline justify-between mb-2">
                            <div className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                              Top leverage moments
                            </div>
                            <div className="text-2xs text-muted-2 tracking-wider">
                              WP × kind weight · sign reflects W/L
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {p.topLeverageMoments.map((m, idx) => (
                              <Link
                                key={`${m.matchId}-${m.round_num}-${idx}`}
                                href={`/app/matches/${m.matchIdHelldock}?tab=Review&round=${m.round_num}`}
                                onClick={(e) => e.stopPropagation()}
                                className={`block bg-surface-2 rounded-lg px-3 py-2 border transition-colors hover:border-gold/50 ${
                                  m.signedScore >= 0
                                    ? 'border-gold/30'
                                    : 'border-crimson/30'
                                }`}
                                title={`Round ${m.round_num} · pre-round WP ${m.wpPctBefore}% · ${m.outcome}`}
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-fg font-semibold text-sm">
                                    {m.kind}
                                  </span>
                                  <span
                                    className={`text-sm font-bold tnum ${
                                      m.signedScore >= 0
                                        ? 'text-gold'
                                        : 'text-crimson'
                                    }`}
                                  >
                                    {m.signedScore >= 0 ? '+' : ''}
                                    {m.signedScore.toFixed(2)}
                                  </span>
                                </div>
                                <div className="text-2xs text-muted-2 mt-0.5 truncate">
                                  {m.matchIdHelldock} · R{m.round_num} ·{' '}
                                  {m.outcome === 'W' ? (
                                    <span className="text-win-green">W</span>
                                  ) : (
                                    <span className="text-crimson">L</span>
                                  )}{' '}
                                  · WP {m.wpPctBefore}%
                                </div>
                                <div className="text-2xs text-muted truncate">
                                  {formatOpponentName(m.opponent)}
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* S17 — Impact + consistency cluster */}
                      <div>
                        <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
                          Impact · consistency
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                          <MiniCard
                            label="Rating 2.0"
                            value={p.rating2 == null ? '—' : p.rating2.toFixed(2)}
                          />
                          <MiniCard
                            label="KPR"
                            value={
                              p.rating2KillsPerRound == null
                                ? '—'
                                : p.rating2KillsPerRound.toFixed(2)
                            }
                          />
                          <MiniCard
                            label="Survive %"
                            value={
                              p.rating2SurvivalRate == null
                                ? '—'
                                : `${Math.round(p.rating2SurvivalRate * 100)}%`
                            }
                          />
                          <MiniCard
                            label="ACS stdev"
                            value={
                              p.acsStdev == null
                                ? '—'
                                : `${p.acsStdev}${p.acsCv != null ? ` (cv ${p.acsCv}%)` : ''}`
                            }
                          />
                          <MiniCard
                            label="3K+ W%"
                            value={
                              p.threeKPlusWinPct == null
                                ? '—'
                                : `${p.threeKPlusWinPct}% (${p.threeKPlusSample})`
                            }
                          />
                          <MiniCard
                            label="Pre / post plant"
                            value={
                              p.prePlantKills + p.postPlantKills === 0
                                ? '—'
                                : `${p.prePlantKills} / ${p.postPlantKills}`
                            }
                          />
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
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
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
  tooltip,
}: {
  label: string
  k: SortKey
  sort: { key: SortKey; dir: SortDir }
  onClick: (k: SortKey) => void
  align: 'left' | 'center' | 'right'
  tooltip?: string
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
        title={tooltip}
        className={`inline-flex items-center gap-1 transition-colors ${
          active ? 'text-gold' : 'hover:text-fg'
        } ${tooltip ? 'cursor-help underline decoration-dotted decoration-muted-2/50 underline-offset-4' : ''}`}
      >
        {label} {arrow && <span className="text-2xs">{arrow}</span>}
      </button>
    </th>
  )
}
