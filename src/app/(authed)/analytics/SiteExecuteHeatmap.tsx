'use client'

import type { MapStat } from '@/lib/analytics'

function gradientFor(pct: number | null): { bg: string; fg: string } {
  if (pct == null) return { bg: 'bg-surface', fg: 'text-muted-2' }
  // Crimson 0% → yellow 50% → win-green 100%. Use Tailwind opacity ramp on actual colors.
  if (pct >= 75) return { bg: 'bg-win-green/30', fg: 'text-win-green' }
  if (pct >= 60) return { bg: 'bg-win-green/20', fg: 'text-win-green' }
  if (pct >= 50) return { bg: 'bg-gold/20', fg: 'text-gold' }
  if (pct >= 40) return { bg: 'bg-gold/10', fg: 'text-gold' }
  if (pct >= 25) return { bg: 'bg-crimson/20', fg: 'text-crimson' }
  return { bg: 'bg-crimson/30', fg: 'text-crimson' }
}

function Cell({ wins, total, pct }: { wins: number; total: number; pct: number | null }) {
  if (total === 0) {
    return (
      <div className="rounded-md px-2 py-2 bg-surface text-center">
        <div className="text-xs text-muted-2">—</div>
      </div>
    )
  }
  const { bg, fg } = gradientFor(pct)
  return (
    <div
      className={`rounded-md px-2 py-2 ${bg} text-center`}
      title={`${wins}-${total - wins} executes (${pct ?? 0}%)`}
    >
      <div className={`text-sm font-bold tnum ${fg}`}>{pct ?? 0}%</div>
      <div className="text-2xs text-muted tnum mt-0.5">
        {wins}–{total - wins}
      </div>
    </div>
  )
}

export default function SiteExecuteHeatmap({ maps }: { maps: MapStat[] }) {
  // Only show maps that have any site execute data
  const rows = maps
    .filter(
      (m) =>
        m.aSiteExecTotal + m.bSiteExecTotal + m.cSiteExecTotal > 0
    )
    .sort(
      (a, b) =>
        b.aSiteExecTotal + b.bSiteExecTotal + b.cSiteExecTotal -
        (a.aSiteExecTotal + a.bSiteExecTotal + a.cSiteExecTotal)
    )

  if (rows.length === 0) return null

  return (
    <div className="bg-surface-2 rounded-2xl border border-line-strong/40 p-5 mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
            Site executes
          </p>
          <h2 className="text-lg font-semibold text-fg leading-tight">
            ATT post-plant conversion
          </h2>
        </div>
        <div className="text-2xs text-muted-2 tnum">
          {rows.length} maps
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-2 text-2xs uppercase tracking-wider text-muted-2 mb-1.5 px-2">
        <div></div>
        <div className="text-center">A</div>
        <div className="text-center">B</div>
        <div className="text-center">C</div>
      </div>

      <div className="space-y-1.5">
        {rows.map((m) => (
          <div
            key={m.map}
            className="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,1fr))] gap-2 items-stretch"
          >
            <div className="flex items-center px-2">
              <span className="text-sm text-fg font-medium truncate">{m.map}</span>
            </div>
            <Cell
              wins={m.aSiteExecWins}
              total={m.aSiteExecTotal}
              pct={m.aSiteExecPct}
            />
            <Cell
              wins={m.bSiteExecWins}
              total={m.bSiteExecTotal}
              pct={m.bSiteExecPct}
            />
            <Cell
              wins={m.cSiteExecWins}
              total={m.cSiteExecTotal}
              pct={m.cSiteExecPct}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
