import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computeTeamDossier } from '@/lib/pro-scout/dossier'
import { readCachedNarrative, memoToHtml } from '@/lib/pro-scout/narrative'
import type {
  ProDossierForm,
  ProDossierMapStat,
  ProDossierPlayer,
  ProTacticalPatterns,
  ProDossierRoleBaseline,
  ProTeamSummary,
} from '@/lib/pro-scout/types'

export const dynamic = 'force-dynamic'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanTeamName(name: string): string {
  const m = name.match(/^.+\s*\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : name.trim()
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function pctClass(p: number | null, kind: 'good-high' | 'good-low' = 'good-high'): string {
  if (p == null) return 'text-muted-2'
  const hi = kind === 'good-high'
  if (p >= 60) return hi ? 'text-win-green' : 'text-crimson'
  if (p >= 40) return 'text-gold'
  return hi ? 'text-crimson' : 'text-win-green'
}

function headlineFromDossier(args: {
  team: ProTeamSummary
  form: ProDossierForm
  maps: ProDossierMapStat[]
  roster: ProDossierPlayer[]
  tactics: ProTacticalPatterns
  baselines: ProDossierRoleBaseline[]
}): string[] {
  const out: string[] = []
  const { form, maps, roster, tactics, baselines } = args

  // Form trend headline
  if (form.played > 0) {
    const trendStr =
      form.trendDelta == null
        ? 'flat'
        : form.trendDelta > 5
        ? 'trending UP'
        : form.trendDelta < -5
        ? 'trending DOWN'
        : 'steady'
    out.push(
      `${form.seriesWins}-${form.seriesLosses} series (${form.mapWinPct ?? '—'}% maps), ${trendStr}${
        form.trendDelta != null ? ` (${form.trendDelta > 0 ? '+' : ''}${form.trendDelta}pp recent vs older)` : ''
      }.`
    )
  }

  // Map strength + weakness
  const goodMap = maps.filter((m) => m.played >= 3 && (m.winPct ?? 0) >= 60).sort((a, b) => (b.winPct ?? 0) - (a.winPct ?? 0))[0]
  const badMap = maps.filter((m) => m.played >= 2 && (m.winPct ?? 0) <= 30).sort((a, b) => (a.winPct ?? 0) - (b.winPct ?? 0))[0]
  if (goodMap)
    out.push(
      `Signature map: ${goodMap.mapName} (${goodMap.winPct}% W on n=${goodMap.played}, picked ${goodMap.picked}× / opp-picked ${goodMap.pickedByOpp}×).`
    )
  if (badMap)
    out.push(
      `Weakness: ${badMap.mapName} (${badMap.winPct}% on n=${badMap.played}). Force-pick into them.`
    )

  // Star + weak link
  const sorted = [...roster].sort((a, b) => (b.avgAcs ?? 0) - (a.avgAcs ?? 0))
  const star = sorted.find((p) => p.maps >= 5)
  const weak = sorted.reverse().find((p) => p.maps >= 5 && (p.avgPlusMinus ?? 0) < -3)
  if (star) {
    const role = star.primaryRole
    const baseline = baselines.find((b) => b.role === role)
    const cmp = baseline?.acsP75 != null && star.avgAcs != null
      ? star.avgAcs >= baseline.acsP75
        ? '(top-quartile for role)'
        : baseline.acsP50 && star.avgAcs >= baseline.acsP50
        ? '(above-median for role)'
        : '(below-median for role)'
      : ''
    out.push(`Carry: ${star.ign} ${role ? `(${role})` : ''} avg ${star.avgAcs} ACS ${cmp}.`)
  }
  if (weak && weak.ign !== star?.ign) {
    out.push(`Weak link: ${weak.ign} (${weak.avgPlusMinus} K/D over ${weak.maps} maps).`)
  }

  // Tactical hint
  if (tactics.closeoutRate != null && tactics.comebackRate != null) {
    if (tactics.comebackRate < 30 && tactics.closeoutRate > 70) {
      out.push(
        `Front-runners (${tactics.closeoutRate}% closeout / ${tactics.comebackRate}% comeback). Get them down early.`
      )
    } else if (tactics.comebackRate > 50) {
      out.push(
        `Comeback team (${tactics.comebackRate}% from behind). Don't ease off when leading.`
      )
    }
  }
  if (tactics.plantRateAtk != null && tactics.plantRateAtk < 35 && tactics.plantAtkN >= 100) {
    out.push(
      `Low plant rate (${tactics.plantRateAtk}% on n=${tactics.plantAtkN} ATK rounds) — passive/pick-driven attack. Play patient defense.`
    )
  }

  return out
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function ProScoutTeamPage({
  params,
}: {
  params: { teamSlug: string }
}) {
  const slug = decodeURIComponent(params.teamSlug)
  const sb = createClient()

  const { data: team } = await sb
    .from('pro_teams')
    .select('id, slug, name')
    .eq('slug', slug)
    .single()
  if (!team) notFound()

  // sb from createClient() and SupabaseClient (admin) are compatible at runtime
  // for read-only ops, but their TS shapes diverge; narrow via a type assertion.
  const dossier = await computeTeamDossier(
    sb as unknown as Parameters<typeof computeTeamDossier>[0],
    team.id
  )
  if (!dossier) notFound()

  const displayName = cleanTeamName(dossier.team.name)
  const headlines = headlineFromDossier({
    team: dossier.team,
    form: dossier.form,
    maps: dossier.maps,
    roster: dossier.roster,
    tactics: dossier.tactics,
    baselines: dossier.roleBaselines,
  })

  const memo = await readCachedNarrative(
    sb as unknown as Parameters<typeof readCachedNarrative>[0],
    team.id,
    dossier.scope.label
  )
  const memoHtml = memo ? memoToHtml(memo.content) : null

  return (
    <main className="min-h-screen px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-baseline gap-3 mb-2">
          <Link
            href="/pro-scout"
            className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
          >
            ← pro scout
          </Link>
          <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">·</span>
          <span className="text-2xs uppercase tracking-[0.16em] text-gold">
            VCT CN scout report
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-1">
              opposition dossier
            </p>
            <h1 className="text-4xl font-bold text-fg leading-tight">{displayName}</h1>
            <p className="text-sm text-muted mt-1">
              {dossier.scope.label} · {dossier.scope.matchCount} matches · last played {fmtDate(dossier.form.lastPlayed)}
            </p>
          </div>
          {dossier.team.url && (
            <a
              href={dossier.team.url}
              target="_blank"
              rel="noopener"
              className="text-xs text-muted-2 hover:text-gold transition-colors underline decoration-dotted"
            >
              vlr.gg ↗
            </a>
          )}
        </div>
      </div>

      {/* Headline takeaways */}
      {headlines.length > 0 && (
        <section className="bg-surface-2 border border-gold/40 rounded-2xl p-5 mb-6">
          <p className="text-2xs uppercase tracking-[0.16em] text-gold mb-3">
            scout headline · auto-computed
          </p>
          <ul className="space-y-1.5 text-sm text-fg">
            {headlines.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gold mt-0.5">▸</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* AI Coach Memo */}
      {memoHtml && (
        <section className="bg-surface-2 border border-gold/60 rounded-2xl p-6 mb-6 relative">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <p className="text-2xs uppercase tracking-[0.16em] text-gold">
              ai coach memo · generated
            </p>
            <p className="text-2xs text-muted-2">
              {memo?.model ?? '—'} · {memo ? fmtDate(memo.generatedAt.slice(0, 10)) : ''}
            </p>
          </div>
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: memoHtml }}
          />
        </section>
      )}

      {/* Form summary */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 text-center">
          <Stat
            label="Series"
            value={`${dossier.form.seriesWins}–${dossier.form.seriesLosses}`}
            color={
              dossier.form.seriesWinPct == null
                ? 'fg'
                : dossier.form.seriesWinPct >= 60
                ? 'win-green'
                : dossier.form.seriesWinPct >= 40
                ? 'gold'
                : 'crimson'
            }
          />
          <Stat
            label="Series W%"
            value={dossier.form.seriesWinPct == null ? '—' : `${dossier.form.seriesWinPct}%`}
            color="gold"
          />
          <Stat
            label="Map W%"
            value={dossier.form.mapWinPct == null ? '—' : `${dossier.form.mapWinPct}%`}
            sub={`${dossier.form.mapWins}–${dossier.form.mapLosses}`}
          />
          <Stat
            label="Recent (5)"
            value={dossier.form.recentForm || '—'}
            mono
          />
          <Stat
            label="Trend"
            value={
              dossier.form.trendDelta == null
                ? '—'
                : `${dossier.form.trendDelta > 0 ? '+' : ''}${dossier.form.trendDelta}pp`
            }
            color={
              dossier.form.trendDelta == null
                ? 'fg'
                : dossier.form.trendDelta > 0
                ? 'win-green'
                : 'crimson'
            }
            sub="map-win % delta"
          />
          <Stat label="Last played" value={fmtDate(dossier.form.lastPlayed)} small />
        </div>
      </section>

      {/* Maps + tactics row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Map pool — 2 cols */}
        <section className="lg:col-span-2 bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Map pool" sub="win % · pick split · side splits · comp" />
          {dossier.maps.length === 0 ? (
            <p className="text-sm text-muted-2">—</p>
          ) : (
            <div className="space-y-2.5">
              {dossier.maps.map((m) => (
                <MapRow key={m.mapName} m={m} />
              ))}
            </div>
          )}
        </section>

        {/* Tactical patterns */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Tactical patterns" />
          <div className="space-y-3">
            <Tendency
              label="Pistol W%"
              value={dossier.tactics.pistolWinPct == null ? '—' : `${dossier.tactics.pistolWinPct}%`}
              sub={`${dossier.tactics.pistolWins}/${dossier.tactics.pistolPlayed} pistols`}
              tone={dossier.tactics.pistolWinPct == null ? 'fg' : dossier.tactics.pistolWinPct >= 55 ? 'win-green' : dossier.tactics.pistolWinPct >= 45 ? 'gold' : 'crimson'}
            />
            <Tendency
              label="Bonus-round W%"
              value={dossier.tactics.bonusRoundWinPct == null ? '—' : `${dossier.tactics.bonusRoundWinPct}%`}
              sub={`${dossier.tactics.bonusRoundWins}/${dossier.tactics.bonusRoundPlayed} (R2 + R14)`}
              tone={dossier.tactics.bonusRoundWinPct == null ? 'fg' : dossier.tactics.bonusRoundWinPct >= 55 ? 'win-green' : 'gold'}
            />
            <Tendency
              label="Plant rate (ATK)"
              value={dossier.tactics.plantRateAtk == null ? '—' : `${dossier.tactics.plantRateAtk}%`}
              sub={`${dossier.tactics.plantAtkN} ATK rounds`}
              tone={dossier.tactics.plantRateAtk == null ? 'fg' : dossier.tactics.plantRateAtk >= 45 ? 'win-green' : dossier.tactics.plantRateAtk >= 35 ? 'gold' : 'crimson'}
            />
            <Tendency
              label="Closeout rate"
              value={dossier.tactics.closeoutRate == null ? '—' : `${dossier.tactics.closeoutRate}%`}
              sub="map W% when leading 1H"
              tone="win-green"
            />
            <Tendency
              label="Comeback rate"
              value={dossier.tactics.comebackRate == null ? '—' : `${dossier.tactics.comebackRate}%`}
              sub="map W% when trailing 1H"
              tone={dossier.tactics.comebackRate == null ? 'fg' : dossier.tactics.comebackRate >= 50 ? 'win-green' : 'crimson'}
            />
            <Tendency
              label="OT"
              value={`${dossier.tactics.otWins}/${dossier.tactics.otPlayed}`}
              sub="OT maps W/Played"
              tone="fg"
            />
          </div>
        </section>
      </div>

      {/* Roster */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Roster" sub="role · signature agent · stats vs league baseline" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wider text-muted-2 border-b border-line">
                <th className="text-left py-2 font-medium">Player</th>
                <th className="text-left py-2 font-medium">Role</th>
                <th className="text-left py-2 font-medium">Signature</th>
                <th className="text-right py-2 font-medium">ACS</th>
                <th className="text-right py-2 font-medium">vs role p50</th>
                <th className="text-right py-2 font-medium">K/D/A</th>
                <th className="text-right py-2 font-medium">+/-</th>
                <th className="text-right py-2 font-medium">Maps</th>
              </tr>
            </thead>
            <tbody>
              {dossier.roster.map((p) => (
                <PlayerRow key={p.playerId} p={p} baselines={dossier.roleBaselines} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top comps */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Top comps" sub="agent combos they run" />
        {dossier.topComps.length === 0 ? (
          <p className="text-sm text-muted-2">—</p>
        ) : (
          <div className="space-y-1.5">
            {dossier.topComps.map((c) => (
              <div
                key={c.agents.join(',')}
                className="grid grid-cols-[1fr_auto_auto] gap-3 items-center text-sm py-1.5 px-2 rounded hover:bg-surface-3"
              >
                <div className="min-w-0">
                  <span className="text-2xs uppercase tracking-wider text-gold mr-2">
                    {c.archetype}
                  </span>
                  <span className="text-fg/90">{c.agents.join(' · ')}</span>
                  <span className="text-2xs text-muted-2 ml-2">on {c.maps.join(', ')}</span>
                </div>
                <span className="font-mono tnum text-xs text-muted">
                  <span className="text-win-green">{c.wins}</span>-
                  <span className="text-crimson">{c.played - c.wins}</span>
                </span>
                <span className={`tnum font-bold w-12 text-right ${pctClass(c.winPct)}`}>
                  {c.winPct == null ? '—' : `${c.winPct}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Match history */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Recent matches" />
        <div className="space-y-1">
          {dossier.recentMatches.map((m) => (
            <a
              key={m.matchId}
              href={m.url ?? '#'}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-between gap-3 text-xs px-3 py-2 rounded-md bg-surface hover:bg-surface-3 transition-colors"
            >
              <span className="font-mono text-muted tnum w-24">{fmtDate(m.date)}</span>
              <span
                className={`font-bold w-6 text-center ${
                  m.result === 'W' ? 'text-win-green' : m.result === 'L' ? 'text-crimson' : 'text-muted-2'
                }`}
              >
                {m.result}
              </span>
              <span className="font-mono tnum text-fg w-16">
                {m.teamScore} – {m.oppScore}
              </span>
              <span className="text-fg flex-1 truncate">
                vs {cleanTeamName(m.opponentName)}
              </span>
              <span className="text-2xs text-muted-2 truncate">
                {m.eventStage ?? '—'}
              </span>
              <span className="text-2xs text-muted-2 truncate">
                {m.maps.map((mp) => `${mp.mapName} ${mp.teamScore}-${mp.oppScore}`).join(' · ')}
              </span>
            </a>
          ))}
        </div>
      </section>

      <footer className="text-center text-2xs uppercase tracking-[0.16em] text-muted-2 py-6">
        data: vlr.gg · scout layer: helldock · last refreshed {fmtDate(new Date().toISOString().slice(0, 10))}
      </footer>
    </main>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {sub && (
        <p className="text-2xs uppercase tracking-wider text-muted-2 mt-0.5">{sub}</p>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  color = 'fg',
  mono = false,
  small = false,
}: {
  label: string
  value: string
  sub?: string
  color?: 'gold' | 'win-green' | 'crimson' | 'fg'
  mono?: boolean
  small?: boolean
}) {
  const fg =
    color === 'gold'
      ? 'text-gold'
      : color === 'win-green'
      ? 'text-win-green'
      : color === 'crimson'
      ? 'text-crimson'
      : 'text-fg'
  return (
    <div>
      <div className="text-2xs uppercase tracking-[0.16em] text-muted-2 mb-1">{label}</div>
      <div className={`${small ? 'text-base' : 'text-xl'} font-bold tnum ${fg} ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
      {sub && <div className="text-2xs text-muted-2 tnum mt-0.5">{sub}</div>}
    </div>
  )
}

function Tendency({
  label,
  value,
  sub,
  tone = 'fg',
}: {
  label: string
  value: string
  sub: string
  tone?: 'fg' | 'gold' | 'crimson' | 'win-green'
}) {
  const fg =
    tone === 'gold'
      ? 'text-gold'
      : tone === 'win-green'
      ? 'text-win-green'
      : tone === 'crimson'
      ? 'text-crimson'
      : 'text-fg'
  return (
    <div className="bg-surface rounded-md px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">{label}</div>
      <div className={`text-lg font-bold tnum ${fg}`}>{value}</div>
      <div className="text-2xs text-muted-2 tnum">{sub}</div>
    </div>
  )
}

function MapRow({ m }: { m: ProDossierMapStat }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-1.5 px-2 rounded hover:bg-surface-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-fg font-medium">{m.mapName}</span>
          <span className="text-2xs uppercase tracking-wider text-muted-2 tnum">
            n={m.played}
          </span>
          <span className="text-2xs text-muted-2 tnum">
            pick {m.picked} · opp {m.pickedByOpp} · dec {m.decider}
          </span>
        </div>
        <div className="text-2xs text-muted mt-0.5">
          atk{' '}
          <span className={pctClass(m.atkWinPct)}>{m.atkWinPct == null ? '—' : `${m.atkWinPct}%`}</span>
          {' · '}
          def{' '}
          <span className={pctClass(m.defWinPct)}>{m.defWinPct == null ? '—' : `${m.defWinPct}%`}</span>
          {m.topAgents.length > 0 && (
            <>
              {' · '}
              <span className="text-muted-2">
                {m.topAgents.slice(0, 5).map((a) => `${a.agent}×${a.count}`).join(', ')}
              </span>
            </>
          )}
        </div>
      </div>
      <span className="font-mono tnum text-xs text-muted">
        <span className="text-win-green">{m.wins}</span>-
        <span className="text-crimson">{m.played - m.wins}</span>
      </span>
      <span className={`tnum font-bold w-14 text-right ${pctClass(m.winPct)}`}>
        {m.winPct == null ? '—' : `${m.winPct}%`}
      </span>
    </div>
  )
}

function PlayerRow({
  p,
  baselines,
}: {
  p: ProDossierPlayer
  baselines: ProDossierRoleBaseline[]
}) {
  const baseline = p.primaryRole ? baselines.find((b) => b.role === p.primaryRole) : null
  let delta: number | null = null
  let deltaTone: 'win-green' | 'crimson' | 'gold' | 'fg' = 'fg'
  if (baseline?.acsP50 != null && p.avgAcs != null) {
    delta = Math.round((p.avgAcs - baseline.acsP50) * 10) / 10
    deltaTone =
      delta >= 15 ? 'win-green' : delta >= 0 ? 'gold' : delta >= -15 ? 'fg' : 'crimson'
  }
  const tone =
    deltaTone === 'win-green'
      ? 'text-win-green'
      : deltaTone === 'gold'
      ? 'text-gold'
      : deltaTone === 'crimson'
      ? 'text-crimson'
      : 'text-fg'

  return (
    <tr className="border-b border-line/30">
      <td className="py-2 font-medium">
        <Link
          href={`/pro-scout/players/${encodeURIComponent(p.ign)}`}
          className="text-fg hover:text-gold transition-colors"
        >
          {p.ign}
        </Link>
      </td>
      <td className="py-2 text-muted">{p.primaryRole ?? '—'}</td>
      <td className="py-2 text-muted">
        {p.signatureAgent ? `${p.signatureAgent.agent} (×${p.signatureAgent.count})` : '—'}
      </td>
      <td className="py-2 text-right tnum text-fg">{p.avgAcs ?? '—'}</td>
      <td className={`py-2 text-right tnum ${tone}`}>
        {delta == null
          ? '—'
          : `${delta > 0 ? '+' : ''}${delta}`}
        {baseline && (
          <span className="text-2xs text-muted-2 ml-1">/p50 {baseline.acsP50?.toFixed(0)}</span>
        )}
      </td>
      <td className="py-2 text-right tnum text-muted">
        {p.avgK}/{p.avgD}/{p.avgA}
      </td>
      <td
        className={`py-2 text-right tnum ${
          (p.avgPlusMinus ?? 0) > 0
            ? 'text-win-green'
            : (p.avgPlusMinus ?? 0) < 0
            ? 'text-crimson'
            : 'text-muted'
        }`}
      >
        {(p.avgPlusMinus ?? 0) > 0 ? '+' : ''}
        {p.avgPlusMinus}
      </td>
      <td className="py-2 text-right tnum text-muted-2">{p.maps}</td>
    </tr>
  )
}
