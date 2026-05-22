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
import MapPoolGrid from '@/components/pro-scout/team/MapPoolGrid'
import TacticalRadar from '@/components/pro-scout/team/TacticalRadar'
import FormSparkline from '@/components/pro-scout/team/FormSparkline'
import RosterTable from '@/components/pro-scout/team/RosterTable'

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
        {/* Map pool — 2 cols, now a visual grid */}
        <section className="lg:col-span-2 bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Map pool" sub="win % · side splits · picks · comp" />
          <MapPoolGrid maps={dossier.maps} />
        </section>

        {/* Tactical patterns — now a 6-spoke radar */}
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Tactical signature" sub="pistol · bonus · plant · closeout · comeback · OT" />
          <TacticalRadar tactics={dossier.tactics} />
        </section>
      </div>

      {/* Roster */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Roster" sub="ACS positioned within role IQR · row accent = role" />
        <RosterTable roster={dossier.roster} baselines={dossier.roleBaselines} />
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
        {dossier.recentMatches.length >= 3 && (
          <div className="mb-4 pb-4 border-b border-line/40">
            <FormSparkline matches={dossier.recentMatches} />
          </div>
        )}
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

