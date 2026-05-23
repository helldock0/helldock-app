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

export default function AnalyticsTabs({
  tab,
  teamSlug,
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
}: {
  tab: TabKey
  teamSlug: string
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
}) {
  function hrefFor(t: TabKey): string {
    const params = new URLSearchParams()
    params.set('tab', t)
    if (teamSlug && teamSlug !== 'all') params.set('team', teamSlug)
    if (hideAcademy) params.set('hideAcademy', '1')
    return `/app/analytics?${params.toString()}`
  }

  function toggleAcademyHref(): string {
    const params = new URLSearchParams()
    params.set('tab', tab)
    if (teamSlug && teamSlug !== 'all') params.set('team', teamSlug)
    if (!hideAcademy) params.set('hideAcademy', '1')
    return `/app/analytics?${params.toString()}`
  }

  return (
    <>
      {/* Coach Summary strip */}
      <CoachSummaryStrip summary={coachSummary} />

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
