// Visual map pool: one row per map with W% bar, atk%/def% split bars,
// pick/opp/dec mini segment, and top agent chips. Replaces the text-heavy
// MapRow with a scannable picks/bans-grade panel.

import type { ProDossierMapStat } from '@/lib/pro-scout/types'

function tierColor(pct: number | null): string {
  if (pct == null) return '#6B7280'
  if (pct >= 60) return '#34D399'   // win-green
  if (pct >= 40) return '#FFD700'   // gold
  return '#DC143C'                  // crimson
}

function pctText(p: number | null): string {
  return p == null ? '—' : `${p}%`
}

function Bar({
  pct,
  color,
  height = 6,
}: {
  pct: number | null
  color: string
  height?: number
}) {
  const w = pct == null ? 0 : Math.max(0, Math.min(100, pct))
  return (
    <div
      className="bg-surface rounded-full overflow-hidden"
      style={{ height }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${w}%`, backgroundColor: color }}
      />
    </div>
  )
}

// Pick split: 3-segment mini bar — picked / opp-picked / decider
function PickSplit({ picked, oppPicked, decider }: { picked: number; oppPicked: number; decider: number }) {
  const total = picked + oppPicked + decider
  if (total === 0) return null
  const p = (n: number) => (n / total) * 100
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-surface w-24">
      <div style={{ width: `${p(picked)}%`, backgroundColor: '#FFD700' }} title={`picked ${picked}`} />
      <div style={{ width: `${p(oppPicked)}%`, backgroundColor: '#8A8A93' }} title={`opp ${oppPicked}`} />
      <div style={{ width: `${p(decider)}%`, backgroundColor: '#3C3C44' }} title={`decider ${decider}`} />
    </div>
  )
}

export default function MapPoolGrid({ maps }: { maps: ProDossierMapStat[] }) {
  if (maps.length === 0) {
    return <p className="text-sm text-muted-2">no map data yet</p>
  }
  return (
    <div className="space-y-3">
      {maps.map((m) => (
        <div key={m.mapName} className="grid grid-cols-[120px_1fr_auto] gap-4 items-start py-2 px-2 rounded hover:bg-surface-3/50">
          {/* Map name + sample */}
          <div className="min-w-0">
            <div className="text-fg font-semibold leading-tight">{m.mapName}</div>
            <div className="text-2xs uppercase tracking-wider text-muted-2 tnum mt-0.5">
              n={m.played} · {m.wins}W–{m.played - m.wins}L
            </div>
          </div>

          {/* Bars + agent chips */}
          <div className="flex flex-col gap-1.5 min-w-0">
            {/* W% bar */}
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xs uppercase tracking-wider text-muted-2">Win %</span>
                <span className="font-mono tnum text-xs font-bold" style={{ color: tierColor(m.winPct) }}>
                  {pctText(m.winPct)}
                </span>
              </div>
              <Bar pct={m.winPct} color={tierColor(m.winPct)} height={6} />
            </div>

            {/* Side splits — atk / def */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-2xs uppercase tracking-wider text-muted-2">ATK</span>
                  <span className="font-mono tnum text-2xs" style={{ color: tierColor(m.atkWinPct) }}>
                    {pctText(m.atkWinPct)}
                  </span>
                </div>
                <Bar pct={m.atkWinPct} color={tierColor(m.atkWinPct)} height={3} />
              </div>
              <div>
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-2xs uppercase tracking-wider text-muted-2">DEF</span>
                  <span className="font-mono tnum text-2xs" style={{ color: tierColor(m.defWinPct) }}>
                    {pctText(m.defWinPct)}
                  </span>
                </div>
                <Bar pct={m.defWinPct} color={tierColor(m.defWinPct)} height={3} />
              </div>
            </div>

            {/* Agent chips */}
            {m.topAgents.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {m.topAgents.slice(0, 6).map((a) => (
                  <span
                    key={a.agent}
                    className="px-1.5 py-0.5 rounded text-2xs bg-surface tnum text-muted"
                  >
                    {a.agent}
                    <span className="text-muted-2 ml-1">×{a.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Pick split column */}
          <div className="flex flex-col items-end gap-1 pt-0.5">
            <span className="text-2xs uppercase tracking-wider text-muted-2">Picks</span>
            <PickSplit picked={m.picked} oppPicked={m.pickedByOpp} decider={m.decider} />
            <span className="text-2xs text-muted-2 tnum">
              <span className="text-gold">{m.picked}</span>
              <span className="mx-1">·</span>
              <span>{m.pickedByOpp}</span>
              <span className="mx-1">·</span>
              <span>{m.decider}</span>
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
