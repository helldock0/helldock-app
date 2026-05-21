'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { OpponentDossier } from '@/lib/opponent-dossier'
import type { LastScrimAudit } from './page'

const SAMPLE_THRESHOLD = 2 // need ≥2 matches on a map before recommending it confidently

function selectBans(dossier: OpponentDossier) {
  // Maps where they're strongest (high opp win %) with enough sample. Sort by oppWinPct desc.
  return dossier.maps
    .filter((m) => m.total >= SAMPLE_THRESHOLD && m.oppWinPct != null)
    .filter((m) => (m.oppWinPct ?? 0) >= 60)
    .sort((a, b) => (b.oppWinPct ?? 0) - (a.oppWinPct ?? 0))
    .slice(0, 3)
}

function selectPicks(dossier: OpponentDossier) {
  // Maps where WE are strongest vs them. Our win% = 100 - oppWinPct.
  return dossier.maps
    .filter((m) => m.total >= SAMPLE_THRESHOLD && m.oppWinPct != null)
    .filter((m) => (m.oppWinPct ?? 100) <= 40)
    .sort((a, b) => (a.oppWinPct ?? 100) - (b.oppWinPct ?? 100))
    .slice(0, 3)
}

function recentForm(dossier: OpponentDossier) {
  return dossier.history.slice(0, 5)
}

function topThreats(dossier: OpponentDossier) {
  return dossier.theirRoster
    .filter((p) => p.matches >= 1 && p.avgAcs != null)
    .sort((a, b) => (b.avgAcs ?? 0) - (a.avgAcs ?? 0))
    .slice(0, 3)
}

function buildMarkdown(dossier: OpponentDossier, audit: LastScrimAudit | null): string {
  const lines: string[] = []
  const w = dossier.wins
  const l = dossier.losses
  lines.push(`# Prep vs ${dossier.name}`)
  lines.push('')
  lines.push(
    `**H2H:** ${w}–${l} (${dossier.winPct == null ? '—' : `${dossier.winPct}%`}) across ${dossier.played} matches · last met ${dossier.lastMet ?? '—'}`
  )
  lines.push('')

  if (audit && audit.findings.length > 0) {
    lines.push(
      `## Last scrim audit · ${audit.matchIdHelldock} (${audit.mapName ?? '—'} vs ${audit.oppName ?? '—'} · ${audit.ourScore ?? '?'}–${audit.oppScore ?? '?'} ${audit.result ?? '—'})`
    )
    for (const f of audit.findings) {
      const tag = f.kind === 'over' ? '⚠️' : '✅'
      lines.push(`- ${tag} **${f.player}** · ${f.note}`)
    }
    lines.push('')
  }

  const recent = recentForm(dossier)
  if (recent.length > 0) {
    lines.push('## Recent form (last 5)')
    for (const h of recent) {
      lines.push(
        `- ${h.date} · ${h.map ?? '—'} · ${h.ourScore ?? '?'}–${h.oppScore ?? '?'} **${h.result ?? '—'}**`
      )
    }
    lines.push('')
  }

  const bans = selectBans(dossier)
  lines.push('## Ban candidates (their strongest maps)')
  if (bans.length === 0) {
    lines.push('- _no map with enough sample reaches ≥60% for them_')
  } else {
    for (const m of bans) {
      lines.push(
        `- **${m.map}** — ${m.oppWins}–${m.oppLosses} (their ${m.oppWinPct}%) · n=${m.total}`
      )
    }
  }
  lines.push('')

  const picks = selectPicks(dossier)
  lines.push('## Pick candidates (our strongest vs them)')
  if (picks.length === 0) {
    lines.push('- _no map with enough sample where we are ≥60%_')
  } else {
    for (const m of picks) {
      lines.push(
        `- **${m.map}** — ${m.oppLosses}–${m.oppWins} (our ${100 - (m.oppWinPct ?? 0)}%) · n=${m.total}`
      )
    }
  }
  lines.push('')

  if (dossier.ourBestComps.length > 0) {
    lines.push('## Comps that have worked for us')
    for (const c of dossier.ourBestComps) {
      lines.push(
        `- ${c.archetype}: ${c.agents.join(' · ')} — ${c.ourWins}–${c.played - c.ourWins} (${c.ourWinPct ?? 0}%)`
      )
    }
    lines.push('')
  }

  const threats = topThreats(dossier)
  if (threats.length > 0) {
    lines.push('## Top threats to watch')
    for (const t of threats) {
      const ag = t.agents
        .slice(0, 2)
        .map((a) => `${a.agent}×${a.count}`)
        .join(', ')
      lines.push(
        `- **${t.displayName ?? t.riotIdFull ?? '—'}** — avg ${t.avgAcs ?? '—'} ACS over ${t.matches} matches${ag ? ` · ${ag}` : ''}`
      )
    }
    lines.push('')
  }

  if (dossier.ourTopFragger) {
    lines.push(
      `**Our top fragger vs them:** ${dossier.ourTopFragger.name} (${dossier.ourTopFragger.avgAcs} ACS)`
    )
    lines.push('')
  }

  const t = dossier.tendencies
  lines.push('## Their tendencies')
  if (t.pistolN > 0) {
    lines.push(`- Pistol W% vs us: **${t.pistolOppWPct}%** (n=${t.pistolN})`)
  }
  if (t.plantN > 0) {
    lines.push(`- Plant rate on their ATT: **${t.plantRate}%** (n=${t.plantN})`)
  }
  if (t.ultN > 0) {
    lines.push(
      `- Avg ults / round: **${(t.avgTheirUlts ?? 0).toFixed(2)}** (n=${t.ultN})`
    )
  }

  // S26 — deep tendencies
  const deep = dossier.deepTendencies
  if (deep.setupsByRound.length > 0) {
    lines.push('')
    lines.push('## Setups by phase (their ATT)')
    for (const s of deep.setupsByRound) {
      const winStr = s.oppWinPct == null ? '—' : `${s.oppWinPct}%`
      const plantStr = s.plantRate == null ? '—' : `${s.plantRate}%`
      const timeStr = s.avgPlantTime == null ? '—' : `${s.avgPlantTime}s avg plant`
      lines.push(
        `- **${s.phase}** (n=${s.total}): ${winStr} win · ${plantStr} plant · ${timeStr}`
      )
    }
  }
  if (deep.execTimingByMap.length > 0) {
    lines.push('')
    lines.push('## Execute timing per map')
    for (const m of deep.execTimingByMap) {
      const parts = m.buckets.map((b) => `${b.pct}% ${b.bucket}`).join(' · ')
      lines.push(
        `- **${m.map}** (n=${m.total}${m.modal ? ` · mostly ${m.modal}` : ''}): ${parts}`
      )
    }
  }
  if (deep.siteByHalf.length > 0) {
    const withSwing = deep.siteByHalf.filter((m) => m.swing.length > 0)
    if (withSwing.length > 0) {
      lines.push('')
      lines.push('## Site swings (1st → 2nd half)')
      for (const m of withSwing) {
        const sw = m.swing
          .map(
            (s) =>
              `${s.site} ${s.deltaPp >= 0 ? '+' : ''}${s.deltaPp}pp`
          )
          .join(', ')
        lines.push(`- **${m.map}**: ${sw}`)
      }
    }
  }

  return lines.join('\n')
}

export default function PrepClient({
  dossier,
  audit,
}: {
  dossier: OpponentDossier
  audit: LastScrimAudit | null
}) {
  const [copied, setCopied] = useState(false)
  const markdown = useMemo(() => buildMarkdown(dossier, audit), [dossier, audit])

  const bans = selectBans(dossier)
  const picks = selectPicks(dossier)
  const recent = recentForm(dossier)
  const threats = topThreats(dossier)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Older browsers — fallback to textarea select
      const ta = document.createElement('textarea')
      ta.value = markdown
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <main className="px-6 py-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-1.5 text-2xs uppercase tracking-[0.16em] text-muted-2"
          >
            <Link
              href="/analytics?tab=opps"
              className="hover:text-gold transition-colors"
            >
              opponents
            </Link>
            <span className="text-muted-2/50">/</span>
            <Link
              href={`/opponents/${encodeURIComponent(dossier.name)}`}
              className="hover:text-gold transition-colors"
            >
              dossier
            </Link>
            <span className="text-muted-2/50">/</span>
            <span className="text-fg/80">prep</span>
          </nav>
          <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mt-2">
            prep checklist
          </p>
          <h1 className="text-3xl font-bold text-fg leading-tight">
            vs {dossier.name}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="px-4 py-2 rounded-md bg-gold text-black font-semibold text-sm hover:bg-gold-hover transition-colors"
        >
          {copied ? '✓ Copied' : '📋 Copy as markdown'}
        </button>
      </div>

      {/* Last scrim audit — shows coaching findings from the most recent match (any opp) */}
      {audit && audit.findings.length > 0 && (
        <section className="bg-surface-2 border border-gold/30 rounded-2xl p-5 mb-5">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-gold mb-0.5">
                📋 Last scrim audit
              </h2>
              <p className="text-2xs uppercase tracking-wider text-muted-2">
                <Link
                  href={`/matches/${audit.matchIdHelldock}/report`}
                  className="hover:text-gold transition-colors"
                  title="Open full post-scrim report"
                >
                  {audit.matchIdHelldock}
                </Link>
                <span className="mx-1.5 text-muted-2/60">·</span>
                <span>{audit.mapName ?? '—'}</span>
                <span className="mx-1.5 text-muted-2/60">·</span>
                <span>vs {audit.oppName ?? '—'}</span>
              </p>
            </div>
            <div
              className={`text-2xs font-bold px-2 py-1 rounded ${
                audit.result === 'W'
                  ? 'bg-win-green/15 text-win-green border border-win-green/40'
                  : audit.result === 'L'
                  ? 'bg-crimson/15 text-crimson border border-crimson/40'
                  : 'bg-surface border border-line text-muted-2'
              }`}
            >
              {audit.ourScore ?? '?'}–{audit.oppScore ?? '?'} {audit.result ?? '—'}
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            {audit.findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 mt-0.5">
                  {f.kind === 'over' ? '⚠️' : '✅'}
                </span>
                <span>
                  <span className="font-medium text-fg">{f.player}</span>
                  <span className="text-muted-2 ml-2">·</span>
                  <span className="text-muted ml-2">{f.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* H2H summary */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-5">
        <div className="text-sm text-fg">
          <span className="font-bold tnum text-gold mr-2">
            {dossier.wins}–{dossier.losses}
          </span>
          <span className="text-muted">
            ({dossier.winPct == null ? '—' : `${dossier.winPct}%`}) across {dossier.played} matches · last met{' '}
            {dossier.lastMet ?? '—'}
          </span>
        </div>
        {recent.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs uppercase tracking-wider text-muted-2 mr-1">
              Last 5:
            </span>
            {recent.map((h) => (
              <span
                key={h.matchIdHelldock}
                className={`text-2xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                  h.result === 'W'
                    ? 'bg-win-green/15 text-win-green border border-win-green/40'
                    : h.result === 'L'
                    ? 'bg-crimson/15 text-crimson border border-crimson/40'
                    : 'bg-surface border border-line text-muted-2'
                }`}
                title={`${h.date} · ${h.map ?? '—'} · ${h.ourScore ?? '?'}–${h.oppScore ?? '?'}`}
              >
                {h.result ?? '—'}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        {/* Bans */}
        <section className="bg-surface-2 border border-crimson/40 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-crimson mb-1">🚫 Ban candidates</h2>
          <p className="text-2xs uppercase tracking-wider text-muted-2 mb-3">
            their strongest maps
          </p>
          {bans.length === 0 ? (
            <p className="text-sm text-muted-2">
              No map with ≥{SAMPLE_THRESHOLD} samples reaches ≥60% for them.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {bans.map((m) => (
                <li
                  key={m.map}
                  className="flex items-center justify-between text-sm gap-3"
                >
                  <span className="text-fg font-medium">{m.map}</span>
                  <span className="text-xs font-mono tnum text-muted">
                    <span className="text-crimson">{m.oppWins}</span>–
                    <span className="text-win-green">{m.oppLosses}</span>
                    <span className="text-muted-2 ml-1.5">n={m.total}</span>
                  </span>
                  <span className="text-sm font-bold tnum text-crimson w-12 text-right">
                    {m.oppWinPct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Picks */}
        <section className="bg-surface-2 border border-win-green/40 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-win-green mb-1">✅ Pick candidates</h2>
          <p className="text-2xs uppercase tracking-wider text-muted-2 mb-3">
            our strongest vs them
          </p>
          {picks.length === 0 ? (
            <p className="text-sm text-muted-2">
              No map with ≥{SAMPLE_THRESHOLD} samples where we are ≥60%.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {picks.map((m) => (
                <li
                  key={m.map}
                  className="flex items-center justify-between text-sm gap-3"
                >
                  <span className="text-fg font-medium">{m.map}</span>
                  <span className="text-xs font-mono tnum text-muted">
                    <span className="text-win-green">{m.oppLosses}</span>–
                    <span className="text-crimson">{m.oppWins}</span>
                    <span className="text-muted-2 ml-1.5">n={m.total}</span>
                  </span>
                  <span className="text-sm font-bold tnum text-win-green w-12 text-right">
                    {100 - (m.oppWinPct ?? 0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Comps that worked */}
      {dossier.ourBestComps.length > 0 && (
        <section className="bg-surface-2 border border-gold/30 rounded-2xl p-5 mb-5">
          <h2 className="text-sm font-semibold text-gold mb-3">
            🎯 Comps that worked for us
          </h2>
          <ul className="space-y-1.5">
            {dossier.ourBestComps.map((c) => (
              <li
                key={c.agents.join(',')}
                className="flex items-center justify-between text-sm gap-3"
              >
                <span className="text-2xs uppercase tracking-wider text-muted-2 shrink-0 w-24 truncate">
                  {c.archetype}
                </span>
                <span className="text-fg/90 truncate flex-1 mx-1 text-xs">
                  {c.agents.join(' · ')}
                </span>
                <span className="font-mono text-muted tnum text-xs shrink-0">
                  <span className="text-win-green">{c.ourWins}</span>-
                  <span className="text-crimson">{c.played - c.ourWins}</span>
                </span>
                <span
                  className={`tnum font-bold w-12 text-right shrink-0 ${
                    c.ourWinPct == null
                      ? 'text-muted-2'
                      : c.ourWinPct >= 60
                      ? 'text-win-green'
                      : 'text-fg'
                  }`}
                >
                  {c.ourWinPct == null ? '—' : `${c.ourWinPct}%`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Threats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-fg mb-3">👀 Top threats</h2>
          {threats.length === 0 ? (
            <p className="text-sm text-muted-2">No ACS data.</p>
          ) : (
            <ul className="space-y-1.5">
              {threats.map((t) => (
                <li
                  key={t.riotIdFull ?? t.displayName ?? ''}
                  className="flex items-center justify-between text-sm gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-fg font-medium truncate">
                      {t.displayName ?? t.riotIdFull ?? '—'}
                    </div>
                    {t.agents.length > 0 && (
                      <div className="text-2xs text-muted-2 truncate">
                        {t.agents
                          .slice(0, 2)
                          .map((a) => `${a.agent}×${a.count}`)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm text-gold font-bold tnum">{t.avgAcs}</div>
                    <div className="text-2xs uppercase tracking-wider text-muted-2 tnum">
                      n={t.matches}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {dossier.ourTopFragger && (
            <div className="mt-4 pt-3 border-t border-line text-sm">
              <span className="text-2xs uppercase tracking-wider text-muted-2 mr-2">
                Counter:
              </span>
              <span className="text-fg font-medium">
                {dossier.ourTopFragger.name}
              </span>
              <span className="ml-2 text-gold tnum font-bold">
                {dossier.ourTopFragger.avgAcs} ACS
              </span>
            </div>
          )}
        </section>

        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-fg mb-3">📊 Their tendencies</h2>
          <ul className="space-y-2 text-sm">
            {dossier.tendencies.pistolN > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-muted">Pistol W%</span>
                <span
                  className={`tnum font-bold ${
                    (dossier.tendencies.pistolOppWPct ?? 0) >= 60
                      ? 'text-crimson'
                      : 'text-fg'
                  }`}
                >
                  {dossier.tendencies.pistolOppWPct}%
                  <span className="ml-2 text-2xs text-muted-2">
                    n={dossier.tendencies.pistolN}
                  </span>
                </span>
              </li>
            )}
            {dossier.tendencies.plantN > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-muted">Plant rate on ATT</span>
                <span className="tnum font-bold text-fg">
                  {dossier.tendencies.plantRate}%
                  <span className="ml-2 text-2xs text-muted-2">
                    n={dossier.tendencies.plantN}
                  </span>
                </span>
              </li>
            )}
            {dossier.tendencies.ultN > 0 && (
              <li className="flex items-center justify-between">
                <span className="text-muted">Avg ults / round</span>
                <span className="tnum font-bold text-fg">
                  {(dossier.tendencies.avgTheirUlts ?? 0).toFixed(2)}
                  <span className="ml-2 text-2xs text-muted-2">
                    n={dossier.tendencies.ultN}
                  </span>
                </span>
              </li>
            )}
          </ul>
        </section>
      </div>

      {/* S26 — Deep tendencies (compact view; full table on opponent dossier) */}
      {(dossier.deepTendencies.setupsByRound.length > 0 ||
        dossier.deepTendencies.execTimingByMap.length > 0 ||
        dossier.deepTendencies.siteByHalf.some((m) => m.swing.length > 0)) && (
        <details className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-5" open>
          <summary className="text-sm font-semibold text-fg cursor-pointer hover:text-gold transition-colors">
            🧠 Tendencies (deep) — setups · exec timing · site swings
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-4">
            {dossier.deepTendencies.setupsByRound.length > 0 && (
              <div>
                <h3 className="text-2xs uppercase tracking-wider text-gold mb-2">
                  Setups by phase
                </h3>
                <ul className="space-y-1 text-xs">
                  {dossier.deepTendencies.setupsByRound.map((s) => (
                    <li key={s.phase} className="flex items-center justify-between gap-2">
                      <span className="text-fg font-medium">{s.phase}</span>
                      <span className="text-2xs text-muted-2 tnum">
                        {s.oppWinPct == null ? '—' : `${s.oppWinPct}%`} W
                        <span className="mx-1.5">·</span>
                        {s.plantRate == null ? '—' : `${s.plantRate}%`} plant
                        <span className="mx-1.5">·</span>
                        n={s.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dossier.deepTendencies.execTimingByMap.length > 0 && (
              <div>
                <h3 className="text-2xs uppercase tracking-wider text-gold mb-2">
                  Exec timing
                </h3>
                <ul className="space-y-1 text-xs">
                  {dossier.deepTendencies.execTimingByMap.slice(0, 6).map((m) => (
                    <li key={m.map} className="flex items-center justify-between gap-2">
                      <span className="text-fg font-medium">{m.map}</span>
                      <span className="text-2xs text-muted-2 tnum">
                        {m.modal ?? '—'}
                        <span className="mx-1.5">·</span>
                        n={m.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dossier.deepTendencies.siteByHalf.some((m) => m.swing.length > 0) && (
              <div>
                <h3 className="text-2xs uppercase tracking-wider text-gold mb-2">
                  Site swings (1st → 2nd half)
                </h3>
                <ul className="space-y-1 text-xs">
                  {dossier.deepTendencies.siteByHalf
                    .filter((m) => m.swing.length > 0)
                    .slice(0, 6)
                    .map((m) => (
                      <li
                        key={m.map}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-fg font-medium">{m.map}</span>
                        <span className="text-2xs tnum">
                          {m.swing.map((s) => (
                            <span
                              key={s.site}
                              className={`ml-1 ${
                                s.deltaPp > 0 ? 'text-gold' : 'text-muted'
                              }`}
                            >
                              {s.site} {s.deltaPp >= 0 ? '+' : ''}
                              {s.deltaPp}pp
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
          <p className="text-2xs text-muted-2 mt-4">
            Full breakdown:{' '}
            <Link
              href={`/opponents/${encodeURIComponent(dossier.name)}`}
              className="text-gold hover:underline"
            >
              opponent dossier →
            </Link>
          </p>
        </details>
      )}

      {/* Raw markdown preview */}
      <details className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
        <summary className="text-sm font-semibold text-muted cursor-pointer hover:text-fg">
          Show markdown
        </summary>
        <pre className="mt-3 text-xs font-mono text-fg/90 whitespace-pre-wrap bg-surface rounded p-3 overflow-x-auto">
          {markdown}
        </pre>
      </details>
    </main>
  )
}
