'use client'

import Link from 'next/link'
import type {
  MapStat,
  PlayerStat,
  OppStat,
  RoundStats,
  CoachSummary,
  CompLabResult,
  CompMatrix,
  MapPoolEntry,
} from '@/lib/analytics'
import type { MmrLookup } from '@/lib/henrik/mmr'
import type { SynergyMatrix } from '@/lib/comp-synergy'
import type { AnalyticsTeamOption } from '@/lib/analytics-team-scope'
import CoachSummaryStrip from './CoachSummaryStrip'
import MapsTab from './MapsTab'
import PlayersTab from './PlayersTab'
import OppsTab from './OppsTab'
import RoundsTab from './RoundsTab'
import CompLabTab from './CompLabTab'
import MapPoolTab from './MapPoolTab'
import GemsTab, { type GemsBundle } from './GemsTab'

type TabKey = 'maps' | 'players' | 'opps' | 'rounds' | 'complab' | 'pool' | 'gems'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'maps', label: 'Maps' },
  { key: 'players', label: 'Players' },
  { key: 'opps', label: 'Opponents' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'complab', label: 'Comp Lab' },
  { key: 'pool', label: 'Map Pool' },
  { key: 'gems', label: 'Gems' },
]

const LAST_GAME_PRESETS = [5, 10, 20]

export default function AnalyticsTabs({
  tab,
  teamSlug,
  teamOptions,
  maps,
  players,
  opps,
  roundsStats,
  coachSummary,
  compLab,
  compMatrix,
  synergy,
  mapPool,
  gems,
  defaultCompMap,
  roundsMapFilter,
  allMaps,
  riotIdsByOpp,
  ranksByRiotId,
  region,
  hideAcademy,
  internalCount,
  lastGames,
  scopedMatchCount,
  totalMatchCount,
  currentMapParam,
}: {
  tab: TabKey
  teamSlug: string
  teamOptions: AnalyticsTeamOption[]
  maps: MapStat[]
  players: PlayerStat[]
  opps: OppStat[]
  roundsStats: RoundStats
  coachSummary: CoachSummary
  compLab: CompLabResult
  compMatrix: CompMatrix
  synergy: SynergyMatrix
  mapPool: MapPoolEntry[]
  gems: GemsBundle
  defaultCompMap: string
  roundsMapFilter: string | null
  allMaps: MapStat[]
  riotIdsByOpp: Record<string, string[]>
  ranksByRiotId: Record<string, MmrLookup>
  region: string
  hideAcademy: boolean
  internalCount: number
  lastGames: number | null
  scopedMatchCount: number
  totalMatchCount: number
  currentMapParam: string | null
}) {
  function addSharedParams(params: URLSearchParams, includeLastGames = true) {
    if (teamSlug) params.set('team', teamSlug)
    if (hideAcademy) params.set('hideAcademy', '1')
    if (currentMapParam) params.set('map', currentMapParam)
    if (includeLastGames && lastGames != null) params.set('lastGames', String(lastGames))
  }

  function hrefFor(t: TabKey): string {
    const params = new URLSearchParams()
    params.set('tab', t)
    addSharedParams(params)
    return `/app/analytics?${params.toString()}`
  }

  function toggleAcademyHref(): string {
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (teamSlug && teamSlug !== 'all') params.set('team', teamSlug)
    if (currentMapParam) params.set('map', currentMapParam)
    if (lastGames != null) params.set('lastGames', String(lastGames))
    if (!hideAcademy) params.set('hideAcademy', '1')
    return `/app/analytics?${params.toString()}`
  }

  function scopeHref(nextLastGames: number | null): string {
    const params = new URLSearchParams()
    params.set('tab', tab)
    addSharedParams(params, false)
    if (nextLastGames != null) params.set('lastGames', String(nextLastGames))
    return `/app/analytics?${params.toString()}`
  }

  function teamHref(nextTeamSlug: string): string {
    const params = new URLSearchParams()
    params.set('tab', tab)
    params.set('team', nextTeamSlug)
    if (hideAcademy) params.set('hideAcademy', '1')
    if (currentMapParam) params.set('map', currentMapParam)
    if (lastGames != null) params.set('lastGames', String(lastGames))
    return `/app/analytics?${params.toString()}`
  }

  const scopePillClass = (active: boolean) =>
    `text-2xs uppercase tracking-[0.12em] px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap ${
      active
        ? 'border-gold/60 bg-gold/12 text-gold'
        : 'border-line-strong/60 text-muted hover:border-gold/60 hover:text-gold'
    }`

  return (
    <>
      {/* Coach Summary strip */}
      <CoachSummaryStrip summary={coachSummary} />

      {teamOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 bg-surface-2 border border-line-strong/40 rounded-2xl px-4 py-3 mb-4">
          <span className="text-2xs uppercase tracking-[0.16em] text-muted-2 mr-1">
            Team
          </span>
          <Link href={teamHref('all')} className={scopePillClass(teamSlug === 'all')}>
            All
          </Link>
          {teamOptions.map((team) => (
            <Link
              key={team.id}
              href={teamHref(team.slug)}
              className={scopePillClass(teamSlug === team.slug)}
            >
              {team.slug}
            </Link>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 border-b border-line mb-6 overflow-x-auto"
        role="tablist"
        aria-label="Analytics views"
      >
        {TABS.map((t) => {
          const active = t.key === tab
          return (
            <Link
              key={t.key}
              href={hrefFor(t.key)}
              role="tab"
              aria-selected={active}
              className={`
                relative px-4 py-2.5 text-sm whitespace-nowrap transition-colors
                ${active ? 'text-gold' : 'text-muted hover:text-fg'}
              `}
            >
              {t.label}
              {active && (
                <span className="absolute -bottom-px left-3 right-3 h-[2px] bg-gold rounded-t-full" />
              )}
            </Link>
          )
        })}

        {internalCount > 0 && (
          <Link
            href={toggleAcademyHref()}
            className={`ml-auto mb-1 text-2xs uppercase tracking-wider px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              hideAcademy
                ? 'border-gold/60 bg-gold/10 text-gold'
                : 'border-line-strong/60 text-muted hover:border-gold/60 hover:text-gold'
            }`}
            title={
              hideAcademy
                ? `Showing scrims only. ${internalCount} academy match${internalCount !== 1 ? 'es' : ''} hidden.`
                : `${internalCount} match${internalCount !== 1 ? 'es' : ''} against your other academy team are included. Click to hide.`
            }
          >
            <span>{hideAcademy ? '☑' : '☐'}</span>
            Hide academy ({internalCount})
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-surface-2 border border-line-strong/40 rounded-2xl px-4 py-3 mb-4">
        <span className="text-2xs uppercase tracking-[0.16em] text-muted-2 mr-1">
          Scope
        </span>
        <Link href={scopeHref(null)} className={scopePillClass(lastGames == null)}>
          All
        </Link>
        {LAST_GAME_PRESETS.map((n) => (
          <Link key={n} href={scopeHref(n)} className={scopePillClass(lastGames === n)}>
            Last {n}
          </Link>
        ))}
        <form action="/app/analytics" className="flex items-center gap-2 ml-0 md:ml-2">
          <input type="hidden" name="tab" value={tab} />
          {teamSlug && <input type="hidden" name="team" value={teamSlug} />}
          {hideAcademy && <input type="hidden" name="hideAcademy" value="1" />}
          {currentMapParam && <input type="hidden" name="map" value={currentMapParam} />}
          <span className="text-2xs uppercase tracking-[0.12em] text-muted-2">Last</span>
          <input
            type="number"
            name="lastGames"
            min={1}
            max={100}
            defaultValue={lastGames ?? ''}
            placeholder="x"
            aria-label="Last games count"
            className="w-16 bg-surface border border-line-strong rounded-md px-2 py-1 text-xs text-fg tnum outline-none focus:border-gold"
          />
          <span className="text-2xs uppercase tracking-[0.12em] text-muted-2">games</span>
          <button
            type="submit"
            className="text-2xs uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-gold text-black font-semibold hover:bg-gold-hover transition-colors"
          >
            Apply
          </button>
        </form>
        <span className="ml-auto text-2xs uppercase tracking-[0.12em] text-muted-2">
          showing {scopedMatchCount} of {totalMatchCount} games
        </span>
      </div>

      {/* Panel */}
      <div role="tabpanel">
        {tab === 'maps' && <MapsTab maps={maps} />}
        {tab === 'players' && <PlayersTab players={players} />}
        {tab === 'opps' && (
          <OppsTab
            opps={opps}
            riotIdsByOpp={riotIdsByOpp}
            ranksByRiotId={ranksByRiotId}
            region={region}
          />
        )}
        {tab === 'rounds' && (
          <RoundsTab
            stats={roundsStats}
            activeMap={roundsMapFilter}
            allMaps={allMaps}
          />
        )}
        {tab === 'complab' && (
          <CompLabTab
            result={compLab}
            defaultMap={defaultCompMap}
            allMaps={allMaps}
            matrix={compMatrix}
            synergy={synergy}
          />
        )}
        {tab === 'pool' && <MapPoolTab pool={mapPool} />}
        {tab === 'gems' && <GemsTab gems={gems} />}
      </div>
    </>
  )
}
