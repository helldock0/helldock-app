'use client'

import type {
  MultiKillLeader,
  ClutchLeader,
  TradeStats,
  FbWeaponStat,
  DamageNetLeader,
  PlantTimingByMap,
} from '@/lib/gems'
import type { RoundCell } from '@/lib/analytics'

export type PistolCarryOver = {
  afterWin: RoundCell
  afterLoss: RoundCell
}

export type GemsBundle = {
  multiKill: MultiKillLeader[]
  clutchLeverage: ClutchLeader[]
  tradePct: TradeStats
  fbWeapons: FbWeaponStat[]
  damageNet: DamageNetLeader[]
  plantTiming: PlantTimingByMap[]
  pistolCarryOver: PistolCarryOver
}

export default function GemsTab({ gems }: { gems: GemsBundle }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <PistolCarryOverCard data={gems.pistolCarryOver} />
      <MultiKillCard rows={gems.multiKill} />
      <ClutchCard rows={gems.clutchLeverage} />
      <TradeCard stats={gems.tradePct} />
      <FbWeaponCard rows={gems.fbWeapons} />
      <DamageNetCard rows={gems.damageNet} />
      <PlantTimingCard rows={gems.plantTiming} />
    </div>
  )
}

function PistolCarryOverCard({ data }: { data: PistolCarryOver }) {
  const aw = data.afterWin
  const al = data.afterLoss
  const delta =
    aw.winPct != null && al.winPct != null
      ? Math.round((aw.winPct - al.winPct) * 10) / 10
      : null
  return (
    <Section
      title="Pistol carry-over"
      subtitle="rounds 2 & 3 W% after pistol W vs L"
      accent="gold"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-win-green/30 bg-win-green/5 p-3">
          <div className="text-2xs uppercase tracking-wider text-muted-2 mb-1">
            after pistol W
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold tnum text-win-green">
              {aw.winPct == null ? '—' : `${aw.winPct}%`}
            </div>
            <div className="text-2xs text-muted-2 tnum">n={aw.total}</div>
          </div>
        </div>
        <div className="rounded-lg border border-crimson/30 bg-crimson/5 p-3">
          <div className="text-2xs uppercase tracking-wider text-muted-2 mb-1">
            after pistol L
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold tnum text-crimson">
              {al.winPct == null ? '—' : `${al.winPct}%`}
            </div>
            <div className="text-2xs text-muted-2 tnum">n={al.total}</div>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-line flex items-baseline justify-between">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">
          delta
        </span>
        <span
          className={`text-xl font-bold tnum ${
            delta == null
              ? 'text-muted-2'
              : delta >= 20
              ? 'text-win-green'
              : delta >= 5
              ? 'text-gold'
              : delta <= -5
              ? 'text-crimson'
              : 'text-muted'
          }`}
          title="W% in bonus rounds after pistol W minus W% after pistol L"
        >
          {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}pp`}
        </span>
      </div>
      <p className="mt-3 text-2xs text-muted-2 leading-relaxed">
        Large positive delta = pistol wins translate to a strong bonus run. A
        small or negative delta means the bonus round economy isn&apos;t being
        converted — review buy patterns on round 2.
      </p>
    </Section>
  )
}

// ── Cards ────────────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string
  subtitle: string
  accent?: 'gold' | 'crimson' | 'win-green'
  children: React.ReactNode
}) {
  const border =
    accent === 'gold'
      ? 'border-gold/30'
      : accent === 'crimson'
      ? 'border-crimson/30'
      : accent === 'win-green'
      ? 'border-win-green/30'
      : 'border-line-strong/40'
  return (
    <section className={`bg-surface-2 border ${border} rounded-2xl p-5`}>
      <div className="mb-3">
        <p className="text-2xs uppercase tracking-[0.16em] text-muted-2">
          {subtitle}
        </p>
        <h2 className="text-lg font-semibold text-fg leading-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function MultiKillCard({ rows }: { rows: MultiKillLeader[] }) {
  const top = rows.slice(0, 6)
  return (
    <Section
      title="Multi-kill leaders"
      subtitle="per-match 2K / 3K / 4K rates"
      accent="gold"
    >
      {top.length === 0 ? (
        <p className="text-sm text-muted-2">—</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-muted-2">
              <th className="text-left py-1 font-normal">Player</th>
              <th className="text-right py-1 font-normal">2K/g</th>
              <th className="text-right py-1 font-normal">3K/g</th>
              <th className="text-right py-1 font-normal">4K/g</th>
              <th className="text-right py-1 font-normal">Aces</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.playerId} className="border-t border-line">
                <td className="py-1.5 text-fg">
                  {r.name}{' '}
                  <span className="text-2xs text-muted-2 tnum">n={r.matches}</span>
                </td>
                <td className="py-1.5 text-right tnum text-fg">
                  {r.twoKPerGame.toFixed(2)}
                </td>
                <td className="py-1.5 text-right tnum text-gold font-semibold">
                  {r.threeKPerGame.toFixed(2)}
                </td>
                <td className="py-1.5 text-right tnum text-fg">
                  {r.fourKPerGame.toFixed(2)}
                </td>
                <td className="py-1.5 text-right tnum text-crimson font-semibold">
                  {r.acesTotal > 0 ? r.acesTotal : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function ClutchCard({ rows }: { rows: ClutchLeader[] }) {
  const top = rows.slice(0, 6)
  return (
    <Section
      title="High-leverage clutches"
      subtitle="1v2+ situations resolved"
      accent="win-green"
    >
      {top.length === 0 ? (
        <p className="text-sm text-muted-2">—</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-muted-2">
              <th className="text-left py-1 font-normal">Player</th>
              <th className="text-right py-1 font-normal">All clutches</th>
              <th className="text-right py-1 font-normal">1v2+</th>
              <th className="text-right py-1 font-normal">/game</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.playerId} className="border-t border-line">
                <td className="py-1.5 text-fg">
                  {r.name}{' '}
                  <span className="text-2xs text-muted-2 tnum">n={r.matches}</span>
                </td>
                <td className="py-1.5 text-right tnum text-fg">{r.clutches}</td>
                <td className="py-1.5 text-right tnum text-win-green font-semibold">
                  {r.highLeverageClutches}
                </td>
                <td className="py-1.5 text-right tnum text-muted">
                  {r.clutchesPerGame.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function TradeCard({ stats }: { stats: TradeStats }) {
  const top = stats.perMap.slice(0, 8)
  return (
    <Section title="Trade %" subtitle="cohesion after losing a duel">
      <div className="flex items-baseline gap-4 mb-3">
        <span className="text-3xl font-bold tnum text-gold">
          {stats.ourTradedPct == null ? '—' : `${stats.ourTradedPct}%`}
        </span>
        <span className="text-xs text-muted-2 tnum">
          of {stats.tradedN} rounds where we died first
        </span>
      </div>
      {top.length > 0 ? (
        <div className="border-t border-line pt-3">
          <p className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-2">
            per map
          </p>
          <div className="space-y-1">
            {top.map((m) => (
              <div
                key={m.map}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-fg">{m.map}</span>
                <span className="tnum text-muted">
                  <span
                    className={`font-semibold ${
                      m.pct != null && m.pct >= 60
                        ? 'text-win-green'
                        : m.pct != null && m.pct < 35
                        ? 'text-crimson'
                        : 'text-fg'
                    }`}
                  >
                    {m.pct == null ? '—' : `${m.pct}%`}
                  </span>
                  <span className="text-2xs text-muted-2 ml-2">n={m.n}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Section>
  )
}

function FbWeaponCard({ rows }: { rows: FbWeaponStat[] }) {
  const top = rows.slice(0, 8)
  return (
    <Section
      title="First-blood weapon meta"
      subtitle="our entries + round-win conversion"
    >
      {top.length === 0 ? (
        <p className="text-sm text-muted-2">—</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-muted-2">
              <th className="text-left py-1 font-normal">Weapon</th>
              <th className="text-right py-1 font-normal">Our FB</th>
              <th className="text-right py-1 font-normal">Their FB</th>
              <th className="text-right py-1 font-normal">Round W% (our FB)</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.weapon} className="border-t border-line">
                <td className="py-1.5 text-fg">{r.weapon}</td>
                <td className="py-1.5 text-right tnum text-win-green">
                  {r.ourFb}
                </td>
                <td className="py-1.5 text-right tnum text-crimson">
                  {r.theirFb}
                </td>
                <td
                  className={`py-1.5 text-right tnum font-semibold ${
                    r.ourFbRoundWinPct == null
                      ? 'text-muted-2'
                      : r.ourFbRoundWinPct >= 60
                      ? 'text-win-green'
                      : r.ourFbRoundWinPct >= 40
                      ? 'text-gold'
                      : 'text-crimson'
                  }`}
                >
                  {r.ourFbRoundWinPct == null ? '—' : `${r.ourFbRoundWinPct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function DamageNetCard({ rows }: { rows: DamageNetLeader[] }) {
  const top = rows.slice(0, 6)
  return (
    <Section
      title="Damage net"
      subtitle="avg made − avg received"
      accent="gold"
    >
      {top.length === 0 ? (
        <p className="text-sm text-muted-2">—</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-muted-2">
              <th className="text-left py-1 font-normal">Player</th>
              <th className="text-right py-1 font-normal">Made</th>
              <th className="text-right py-1 font-normal">Received</th>
              <th className="text-right py-1 font-normal">Net</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => (
              <tr key={r.playerId} className="border-t border-line">
                <td className="py-1.5 text-fg">
                  {r.name}{' '}
                  <span className="text-2xs text-muted-2 tnum">n={r.matches}</span>
                </td>
                <td className="py-1.5 text-right tnum text-fg">
                  {r.avgMade ?? '—'}
                </td>
                <td className="py-1.5 text-right tnum text-muted">
                  {r.avgReceived ?? '—'}
                </td>
                <td
                  className={`py-1.5 text-right tnum font-semibold ${
                    r.avgNet == null
                      ? 'text-muted-2'
                      : r.avgNet > 0
                      ? 'text-win-green'
                      : 'text-crimson'
                  }`}
                >
                  {r.avgNet == null
                    ? '—'
                    : r.avgNet > 0
                    ? `+${r.avgNet}`
                    : r.avgNet}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  )
}

function fmtSeconds(s: number | null): string {
  if (s == null) return '—'
  const mm = Math.floor(s / 60)
  const ss = Math.round(s - mm * 60)
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

function PlantTimingCard({ rows }: { rows: PlantTimingByMap[] }) {
  const top = rows.slice(0, 8)
  return (
    <Section
      title="Plant timing × outcome"
      subtitle="our ATT plants — winners vs losers"
    >
      {top.length === 0 ? (
        <p className="text-sm text-muted-2">need 3+ plants per map</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-wider text-muted-2">
              <th className="text-left py-1 font-normal">Map</th>
              <th className="text-right py-1 font-normal">Wins (med)</th>
              <th className="text-right py-1 font-normal">Losses (med)</th>
              <th className="text-right py-1 font-normal">Δ</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => {
              const delta =
                r.winMedianSec != null && r.lossMedianSec != null
                  ? Math.round((r.winMedianSec - r.lossMedianSec) * 10) / 10
                  : null
              return (
                <tr key={r.map} className="border-t border-line">
                  <td className="py-1.5 text-fg">{r.map}</td>
                  <td className="py-1.5 text-right tnum text-win-green">
                    {fmtSeconds(r.winMedianSec)}
                    <span className="text-2xs text-muted-2 ml-1">n={r.winN}</span>
                  </td>
                  <td className="py-1.5 text-right tnum text-crimson">
                    {fmtSeconds(r.lossMedianSec)}
                    <span className="text-2xs text-muted-2 ml-1">n={r.lossN}</span>
                  </td>
                  <td
                    className={`py-1.5 text-right tnum font-semibold ${
                      delta == null
                        ? 'text-muted-2'
                        : delta < 0
                        ? 'text-win-green'
                        : 'text-crimson'
                    }`}
                  >
                    {delta == null
                      ? '—'
                      : `${delta > 0 ? '+' : ''}${delta}s`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Section>
  )
}
