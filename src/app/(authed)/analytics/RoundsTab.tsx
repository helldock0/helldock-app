'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { RoundStats, RoundCell, MapStat } from '@/lib/analytics'
import { ROUND_TYPES } from '@/lib/analytics'
import { MAPS } from '@/lib/valorant'
import UltCastsChart from '@/components/charts/UltCastsChart'

function fmtPct(c: RoundCell): string {
  return c.winPct == null ? '—' : `${c.winPct}%`
}

function cellBg(pct: number | null): string {
  if (pct == null) return 'bg-surface'
  if (pct >= 60) return 'bg-win-green/15'
  if (pct >= 45) return 'bg-gold/10'
  if (pct >= 30) return 'bg-surface-3'
  return 'bg-crimson/15'
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface-2 rounded-2xl p-5 border border-line-strong/40">
      <h3 className="text-2xs uppercase tracking-[0.22em] text-muted-2 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function MiniStat({
  label,
  cell,
  color = 'gold',
}: {
  label: string
  cell: RoundCell
  color?: 'gold' | 'green' | 'crimson'
}) {
  const valColor =
    color === 'green' ? 'text-win-green' : color === 'crimson' ? 'text-crimson' : 'text-gold'
  return (
    <div>
      <div className="text-2xs uppercase tracking-wider text-muted-2 mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className={`text-2xl font-bold tnum ${valColor}`}>{fmtPct(cell)}</div>
        <div className="text-2xs text-muted-2 tnum">n={cell.total}</div>
      </div>
    </div>
  )
}

export default function RoundsTab({
  stats,
  activeMap,
  allMaps,
}: {
  stats: RoundStats
  activeMap: string | null
  allMaps: MapStat[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function changeMap(map: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', 'rounds')
    if (map === '') params.delete('map')
    else params.set('map', map)
    router.push(`/analytics?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Map filter */}
      <div className="flex flex-wrap items-center gap-3 bg-surface-2 border border-line-strong/40 rounded-2xl p-4">
        <label className="text-2xs uppercase tracking-[0.16em] text-muted-2">
          Map
        </label>
        <select
          value={activeMap ?? ''}
          onChange={(e) => changeMap(e.target.value)}
          className="bg-surface border border-line-strong text-fg rounded-md px-3 py-1.5 text-sm hover:border-gold/60 transition-colors"
        >
          <option value="">All maps</option>
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
          {activeMap ? `filtered to ${activeMap}` : 'all maps · aggregated'}
        </p>
      </div>

      {/* Ult casts per round — full width */}
      <Section title="Ult casts per round">
        <div className="mb-2 text-2xs text-muted-2 leading-relaxed">
          Average ults dumped per round across matches in scope. Spikes after a
          pistol win or before a force usually mean coordinated ult plays.
        </div>
        <UltCastsChart points={stats.ultsByRound} />
      </Section>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Quadrant 1 — round-type × side matrix */}
      <Section title="Round type × side">
        <div className="overflow-hidden rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-[0.16em] text-muted-2">
                <th className="text-left px-3 py-2 bg-surface font-semibold">Type</th>
                <th className="text-center px-3 py-2 bg-surface font-semibold">ATT</th>
                <th className="text-center px-3 py-2 bg-surface font-semibold">DEF</th>
              </tr>
            </thead>
            <tbody>
              {ROUND_TYPES.map((rt, i) => {
                const m = stats.matrix[rt]
                return (
                  <tr
                    key={rt}
                    className={i !== ROUND_TYPES.length - 1 ? 'border-b border-line' : ''}
                  >
                    <td className="px-3 py-2 text-fg font-medium">{rt}</td>
                    <td className={`px-3 py-2 text-center ${cellBg(m.att.winPct)}`}>
                      <div className="font-mono text-fg tnum">{fmtPct(m.att)}</div>
                      <div className="text-2xs text-muted-2 tnum">n={m.att.total}</div>
                    </td>
                    <td className={`px-3 py-2 text-center ${cellBg(m.def.winPct)}`}>
                      <div className="font-mono text-fg tnum">{fmtPct(m.def)}</div>
                      <div className="text-2xs text-muted-2 tnum">n={m.def.total}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Quadrant 2 — First blood impact */}
      <Section title="First-blood impact">
        <div className="grid grid-cols-2 gap-6">
          <MiniStat
            label="When we get FB → W%"
            cell={stats.firstBlood.ourFb}
            color="green"
          />
          <MiniStat
            label="When they get FB → W%"
            cell={stats.firstBlood.theirFb}
            color="crimson"
          />
        </div>
        <p className="mt-4 text-2xs text-muted-2 leading-relaxed">
          High delta = FB swing matters a lot. Tighten entries / trades to convert more.
        </p>
      </Section>

      {/* Quadrant 3 — Halves */}
      <Section title="Half splits">
        <div className="grid grid-cols-3 gap-6">
          <MiniStat label="1st Half" cell={stats.halves.first} />
          <MiniStat label="2nd Half" cell={stats.halves.second} />
          <MiniStat label="Overtime" cell={stats.halves.ot} />
        </div>
      </Section>

      {/* Quadrant 4 — Pistol focus */}
      <Section title="Pistol focus">
        <div className="grid grid-cols-2 gap-6 mb-5">
          <MiniStat label="ATT Pistol" cell={stats.pistol.att} />
          <MiniStat label="DEF Pistol" cell={stats.pistol.def} />
        </div>
        <div className="border-t border-line pt-4">
          <div className="text-2xs uppercase tracking-wider text-muted-2 mb-2">
            Carry-over (rounds 2–3 after pistol)
          </div>
          <div className="grid grid-cols-2 gap-6">
            <MiniStat
              label="After pistol W"
              cell={stats.pistol.bonusAfterWin}
              color="green"
            />
            <MiniStat
              label="After pistol L"
              cell={stats.pistol.bonusAfterLoss}
              color="crimson"
            />
          </div>
        </div>
      </Section>

      {/* Quadrant 5 — Site executes */}
      <Section title="Site execute (ATT)">
        <div className="grid grid-cols-3 gap-6">
          <MiniStat label="A site" cell={stats.sites.a} />
          <MiniStat label="B site" cell={stats.sites.b} />
          <MiniStat label="C site" cell={stats.sites.c} />
        </div>
        <p className="mt-4 text-2xs text-muted-2 leading-relaxed">
          % of attacks where bomb planted at the site → round won. Needs site data from plants.
        </p>
      </Section>

      {/* Quadrant 6 — Round-type combined */}
      <Section title="Round type · combined">
        <div className="grid grid-cols-2 gap-6 mb-2">
          <MiniStat label="Anti-Eco" cell={stats.combined.antiEco} color="green" />
          <MiniStat label="Eco" cell={stats.combined.eco} color="crimson" />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <MiniStat label="Bonus" cell={stats.combined.bonus} />
          <MiniStat label="Full Buy" cell={stats.combined.fullBuy} />
        </div>
      </Section>

      {/* Quadrant 7 — Bomb timing (V4) */}
      <Section title="Bomb timing">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-2 mb-1">
              Median plant
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tnum text-gold">
                {stats.bombTiming.medianPlantTime == null
                  ? '—'
                  : `${stats.bombTiming.medianPlantTime}s`}
              </div>
              <div className="text-2xs text-muted-2 tnum">
                n={stats.bombTiming.plantSample}
              </div>
            </div>
            {stats.bombTiming.avgPlantTime != null && (
              <div className="text-2xs text-muted-2 mt-1 tnum">
                avg {stats.bombTiming.avgPlantTime}s
              </div>
            )}
          </div>
          <div>
            <div className="text-2xs uppercase tracking-wider text-muted-2 mb-1">
              Median defuse
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tnum text-win-green">
                {stats.bombTiming.medianDefuseTime == null
                  ? '—'
                  : `${stats.bombTiming.medianDefuseTime}s`}
              </div>
              <div className="text-2xs text-muted-2 tnum">
                n={stats.bombTiming.defuseSample}
              </div>
            </div>
            {stats.bombTiming.avgDefuseTime != null && (
              <div className="text-2xs text-muted-2 mt-1 tnum">
                avg {stats.bombTiming.avgDefuseTime}s
              </div>
            )}
          </div>
        </div>
        <p className="mt-4 text-2xs text-muted-2 leading-relaxed">
          Seconds into the round. Late plants → execute slow. Late defuses → retake too aggressive.
        </p>
      </Section>
    </div>
    </div>
  )
}
