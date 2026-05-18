'use client'

import Link from 'next/link'
import type { MapStat } from '@/lib/analytics'

function Bar({ pct, color }: { pct: number | null; color: 'gold' | 'crimson' | 'muted' }) {
  const fill = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  const colorClass =
    color === 'gold'
      ? 'bg-gold'
      : color === 'crimson'
      ? 'bg-crimson'
      : 'bg-muted-2'
  return (
    <div className="relative h-1.5 bg-line rounded-full overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 ${colorClass} rounded-full transition-[width] duration-300 ease-out`}
        style={{ width: `${fill}%` }}
      />
    </div>
  )
}

export default function MapsTab({ maps }: { maps: MapStat[] }) {
  const played = maps.filter((m) => m.total > 0)
  const unplayed = maps.filter((m) => m.total === 0)

  return (
    <div>
      {/* Played map grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {played.map((m) => (
          <MapCard key={m.map} stat={m} />
        ))}
      </div>

      {/* Unplayed maps — collapsed strip */}
      {unplayed.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
            Not played yet
          </p>
          <div className="flex flex-wrap gap-2">
            {unplayed.map((m) => (
              <span
                key={m.map}
                className="text-xs px-2.5 py-1 rounded-md bg-surface-2 border border-line text-muted-2"
              >
                {m.map}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const TIER_BADGE: Record<string, string> = {
  S: 'bg-win-green/15 text-win-green border-win-green/40',
  A: 'bg-gold/15 text-gold border-gold/40',
  B: 'bg-blue-400/15 text-blue-300 border-blue-400/40',
  C: 'bg-crimson/15 text-crimson border-crimson/40',
  DEV: 'bg-surface text-muted border-line-strong',
}

function MapCard({ stat }: { stat: MapStat }) {
  return (
    <Link
      href={`/matches?map=${encodeURIComponent(stat.map)}`}
      className="block group"
    >
      <div className="bg-surface-2 rounded-2xl p-5 border border-line-strong/40 h-full transition-colors hover:bg-surface-3 hover:border-line-strong">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-lg font-semibold text-fg leading-tight">{stat.map}</div>
            <div className="text-xs text-muted mt-0.5 tnum">
              {stat.total} {stat.total === 1 ? 'game' : 'games'} ·{' '}
              <span className="text-win-green">{stat.wins}W</span>
              {' · '}
              <span className="text-crimson">{stat.losses}L</span>
              {stat.avgFor != null && stat.avgAgainst != null && (
                <span className="text-muted-2 ml-1.5">
                  · avg {stat.avgFor}–{stat.avgAgainst}
                </span>
              )}
            </div>
          </div>
          <span
            className={`text-2xs uppercase tracking-wider px-2 py-0.5 rounded border font-bold ${TIER_BADGE[stat.tier]}`}
            title="Map comfort tier"
          >
            {stat.tier}
          </span>
        </div>

        {/* Overall win % */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">
              Win rate
            </span>
            <span className="text-xl font-bold text-gold tnum">
              {stat.winPct == null ? '—' : `${stat.winPct}%`}
            </span>
          </div>
          <Bar pct={stat.winPct} color="gold" />
        </div>

        {/* Side splits */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xs uppercase tracking-wider text-muted-2">ATT</span>
              <span className="text-xs text-fg tnum">
                {stat.attPct == null ? '—' : `${stat.attPct}%`}
                <span className="text-muted-2 ml-1">n={stat.attTotal}</span>
              </span>
            </div>
            <Bar pct={stat.attPct} color="gold" />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-2xs uppercase tracking-wider text-muted-2">DEF</span>
              <span className="text-xs text-fg tnum">
                {stat.defPct == null ? '—' : `${stat.defPct}%`}
                <span className="text-muted-2 ml-1">n={stat.defTotal}</span>
              </span>
            </div>
            <Bar pct={stat.defPct} color="crimson" />
          </div>
        </div>

        {/* Pistol + econ chips */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <Chip label="Pistol ATT" value={stat.pistolAttPct} n={stat.pistolAttTotal} color="gold" />
          <Chip label="Pistol DEF" value={stat.pistolDefPct} n={stat.pistolDefTotal} color="crimson" />
          <Chip label="Anti-Eco" value={stat.antiEcoPct} n={stat.antiEcoTotal} color="muted" />
          <Chip label="Eco" value={stat.ecoPct} n={stat.ecoTotal} color="muted" />
        </div>

        {/* Site executes */}
        {(stat.aSiteExecTotal + stat.bSiteExecTotal + stat.cSiteExecTotal > 0) && (
          <div className="mb-4 pt-3 border-t border-line">
            <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
              Site execute (ATT)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SiteBar label="A" pct={stat.aSiteExecPct} n={stat.aSiteExecTotal} />
              <SiteBar label="B" pct={stat.bSiteExecPct} n={stat.bSiteExecTotal} />
              <SiteBar label="C" pct={stat.cSiteExecPct} n={stat.cSiteExecTotal} />
            </div>
          </div>
        )}

        {/* Top comps */}
        {stat.topComps.length > 0 && (
          <div className="pt-3 border-t border-line">
            <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
              Top comps
            </div>
            <div className="space-y-1.5">
              {stat.topComps.map((c) => (
                <div
                  key={c.agents.join(',')}
                  className="flex items-center justify-between text-xs gap-2"
                >
                  <span className="text-2xs uppercase tracking-wider text-muted-2 shrink-0">
                    {c.archetype}
                  </span>
                  <span className="text-fg/90 truncate flex-1 mx-1">
                    {c.agents.join(' · ')}
                  </span>
                  <span className="font-mono text-muted tnum shrink-0">
                    <span className="text-win-green">{c.wins}</span>-
                    <span className="text-crimson">{c.total - c.wins}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}

function Chip({
  label,
  value,
  n,
  color,
}: {
  label: string
  value: number | null
  n: number
  color: 'gold' | 'crimson' | 'muted'
}) {
  const v = value == null ? '—' : `${value}%`
  const valColor =
    color === 'gold' ? 'text-gold' : color === 'crimson' ? 'text-crimson' : 'text-fg'
  return (
    <div className="bg-surface rounded-md px-2 py-1.5 flex items-baseline justify-between">
      <span className="text-2xs uppercase tracking-wider text-muted-2">{label}</span>
      <span className="text-xs tnum">
        <span className={`${valColor} font-medium`}>{v}</span>
        <span className="text-muted-2 ml-1">n={n}</span>
      </span>
    </div>
  )
}

function SiteBar({ label, pct, n }: { label: string; pct: number | null; n: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-2xs uppercase tracking-wider text-muted-2">{label}</span>
        <span className="text-xs text-fg tnum">
          {pct == null ? '—' : `${pct}%`}
          <span className="text-muted-2 ml-1">n={n}</span>
        </span>
      </div>
      <Bar pct={pct} color="gold" />
    </div>
  )
}
