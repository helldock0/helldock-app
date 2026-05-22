import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { computePlayerDossier } from '@/lib/pro-scout/player-dossier'
import IgnAvatar from '@/components/pro-scout/player/IgnAvatar'
import RadarPizzaChart from '@/components/pro-scout/player/RadarPizzaChart'
import TopPercentilesList from '@/components/pro-scout/player/TopPercentilesList'
import SimilarPlayersList from '@/components/pro-scout/player/SimilarPlayersList'
import AgentMapGrid from '@/components/pro-scout/player/AgentMapGrid'
import PeerScatterPlot from '@/components/pro-scout/player/PeerScatterPlot'
import RecentFormStrip from '@/components/pro-scout/player/RecentFormStrip'

export const dynamic = 'force-dynamic'

function cleanTeamName(name: string | null): string {
  if (!name) return '—'
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

export default async function ProScoutPlayerPage({
  params,
}: {
  params: { playerIgn: string }
}) {
  const ign = decodeURIComponent(params.playerIgn)
  const sb = createClient()
  const dossier = await computePlayerDossier(
    sb as unknown as Parameters<typeof computePlayerDossier>[0],
    ign
  )
  if (!dossier) notFound()

  const { player, career, sample, slices, topPercentiles, similarPlayers, agentMapGrid, peerScatter, recentForm } = dossier

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <Link
            href="/pro-scout"
            className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
          >
            ← pro scout
          </Link>
          {player.teamSlug && (
            <>
              <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">·</span>
              <Link
                href={`/pro-scout/${player.teamSlug}`}
                className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
              >
                {cleanTeamName(player.teamName)}
              </Link>
            </>
          )}
          <span className="text-2xs uppercase tracking-[0.16em] text-muted-2">·</span>
          <span className="text-2xs uppercase tracking-[0.16em] text-gold">player dossier</span>
        </div>
      </div>

      {/* Header card */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap items-start gap-6">
          <IgnAvatar ign={player.ign} size={88} />
          <div className="flex-1 min-w-0">
            <p className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-1">
              {player.primaryRole ?? 'flex'} · {player.country ?? 'CN'}
            </p>
            <h1 className="text-4xl font-bold text-fg leading-tight">{player.ign}</h1>
            {player.realName && (
              <p className="text-sm text-muted mt-1">{player.realName}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {player.teamSlug ? (
                <Link
                  href={`/pro-scout/${player.teamSlug}`}
                  className="text-gold hover:underline"
                >
                  {cleanTeamName(player.teamName)}
                </Link>
              ) : (
                <span className="text-muted">{cleanTeamName(player.teamName)}</span>
              )}
              {player.signatureAgent && (
                <span className="text-2xs uppercase tracking-wider text-muted-2">
                  signature: <span className="text-fg">{player.signatureAgent.agent}</span> (×{player.signatureAgent.count})
                </span>
              )}
              {player.topAgents.length > 1 && (
                <span className="text-2xs text-muted-2">
                  pool: {player.topAgents.slice(0, 4).map((a) => `${a.agent}×${a.count}`).join(' · ')}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center w-full lg:w-auto">
            <Stat label="Matches" value={String(career.matches)} />
            <Stat label="Maps" value={String(career.maps)} />
            <Stat label="W–L" value={`${career.wins}–${career.losses}`} />
            <Stat label="ACS" value={career.avgAcs == null ? '—' : String(career.avgAcs)} color="gold" />
            <Stat label="K/D" value={career.kdRatio == null ? '—' : career.kdRatio.toFixed(2)} mono />
            <Stat label="+/-" value={career.avgPlusMinus == null ? '—' : `${career.avgPlusMinus > 0 ? '+' : ''}${career.avgPlusMinus}`} color={(career.avgPlusMinus ?? 0) > 0 ? 'win-green' : (career.avgPlusMinus ?? 0) < 0 ? 'crimson' : 'fg'} />
          </div>
        </div>
        {sample === 'small' && (
          <div className="mt-4 text-2xs uppercase tracking-wider text-crimson border border-crimson/40 bg-crimson/5 rounded-md px-3 py-2 inline-block">
            small sample ({career.maps} maps) — percentiles below are unreliable
          </div>
        )}
      </section>

      {/* Radar + Top percentiles */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 mb-6">
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader
            title="Percentile profile"
            sub={`vs ${player.primaryRole ?? 'all'} peers in VCT CN · 0–100`}
          />
          <RadarPizzaChart slices={slices} />
        </section>
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Top 5 percentiles" />
          <TopPercentilesList slices={topPercentiles} />
        </section>
      </div>

      {/* Similar players + Agent x Map grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 mb-6">
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Most similar" sub="cosine on percentile vector" />
          <SimilarPlayersList players={similarPlayers} />
        </section>
        <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
          <SectionHeader title="Agent × map" sub="avg ACS · darker = higher · hover for detail" />
          <AgentMapGrid
            agents={agentMapGrid.agents}
            maps={agentMapGrid.maps}
            cells={agentMapGrid.cells}
            minAcs={agentMapGrid.minAcs}
            maxAcs={agentMapGrid.maxAcs}
          />
        </section>
      </div>

      {/* Peer scatter */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader
          title="Peer cloud"
          sub={`K/D × ACS · ${peerScatter.length - 1} ${player.primaryRole ?? 'pro'} peers · ${player.ign} in gold`}
        />
        <PeerScatterPlot points={peerScatter} />
      </section>

      {/* Recent form */}
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5 mb-6">
        <SectionHeader title="Recent form" sub={`last ${recentForm.length} maps`} />
        <RecentFormStrip entries={recentForm} />
      </section>

      <footer className="text-center text-2xs uppercase tracking-[0.16em] text-muted-2 py-6">
        data: vlr.gg · scout layer: helldock · last played {fmtDate(career.lastPlayed)}
      </footer>
    </main>
  )
}

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
  color = 'fg',
  mono = false,
}: {
  label: string
  value: string
  color?: 'gold' | 'win-green' | 'crimson' | 'fg'
  mono?: boolean
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
      <div className={`text-xl font-bold tnum ${fg} ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
