'use client'

import { useState } from 'react'
import type { AgentMapCell } from '@/lib/pro-scout/types'

// Map ACS in [minAcs, maxAcs] to an opacity 0.15..1 over the gold ramp.
function scaleColor(acs: number | null, min: number | null, max: number | null): string {
  if (acs == null || min == null || max == null || max <= min) {
    return 'rgba(255, 215, 0, 0.18)'
  }
  const t = Math.max(0, Math.min(1, (acs - min) / (max - min)))
  const alpha = 0.15 + t * 0.85
  return `rgba(255, 215, 0, ${alpha.toFixed(2)})`
}

export default function AgentMapGrid({
  agents,
  maps,
  cells,
  maxAcs,
  minAcs,
}: {
  agents: string[]
  maps: string[]
  cells: AgentMapCell[]
  maxAcs: number | null
  minAcs: number | null
}) {
  const [hover, setHover] = useState<AgentMapCell | null>(null)
  const cellMap = new Map<string, AgentMapCell>(
    cells.map((c) => [`${c.agent}__${c.mapName}`, c])
  )

  if (agents.length === 0 || maps.length === 0) {
    return <p className="text-sm text-muted-2">no agent×map data yet</p>
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="inline-block min-w-full">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `minmax(80px, auto) repeat(${maps.length}, minmax(54px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div />
          {maps.map((m) => (
            <div
              key={m}
              className="text-2xs uppercase tracking-wider text-muted-2 text-center font-medium px-1 pb-1"
            >
              {m}
            </div>
          ))}

          {/* Body rows */}
          {agents.map((agent) => (
            <div key={agent} className="contents">
              <div className="text-xs text-fg font-medium pr-2 flex items-center">
                {agent}
              </div>
              {maps.map((m) => {
                const cell = cellMap.get(`${agent}__${m}`) ?? null
                const bg = cell ? scaleColor(cell.avgAcs, minAcs, maxAcs) : 'transparent'
                const border = cell ? 'border-line/40' : 'border-line/15'
                return (
                  <div
                    key={`${agent}__${m}`}
                    onMouseEnter={() => cell && setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    className={`h-10 rounded border ${border} flex flex-col items-center justify-center cursor-default transition-transform hover:scale-105`}
                    style={{ backgroundColor: bg }}
                  >
                    {cell ? (
                      <>
                        <div className="font-mono tnum text-xs font-bold text-fg leading-none">
                          {cell.avgAcs ?? '—'}
                        </div>
                        <div className="text-[9px] text-muted-2 tnum leading-none mt-0.5">
                          n{cell.sample}
                        </div>
                      </>
                    ) : (
                      <div className="text-2xs text-muted-2/40">·</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="mt-3 text-2xs text-muted-2 flex flex-wrap items-center gap-3">
          <span>cell = avg ACS · darker = higher</span>
          {hover && (
            <span className="text-fg">
              <span className="text-gold">{hover.agent}</span> on{' '}
              <span className="text-gold">{hover.mapName}</span>:{' '}
              {hover.played} maps, {hover.wins}-{hover.played - hover.wins} (
              {hover.winPct ?? '—'}%), {hover.avgAcs ?? '—'} ACS,{' '}
              {(hover.avgPlusMinus ?? 0) > 0 ? '+' : ''}
              {hover.avgPlusMinus ?? '—'} +/−
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
