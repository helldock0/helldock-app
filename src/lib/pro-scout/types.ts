/**
 * Shapes consumed by the /pro-scout UI.
 * Computed by computeTeamDossier(teamId) in dossier.ts.
 */

import type { AgentRole } from './agent-roles'

export type ProTeamSummary = {
  id: string
  vlrTeamId: number
  name: string
  tag: string | null
  region: string
  url: string | null
  logoUrl: string | null
}

export type ProDossierForm = {
  played: number
  mapWins: number
  mapLosses: number
  mapWinPct: number | null     // map win rate, more granular than series
  seriesWins: number
  seriesLosses: number
  seriesWinPct: number | null
  recentForm: string           // e.g. 'W-W-L-L-W' (last 5 series, most recent first)
  trendDelta: number | null    // +/- map-win % delta last-half vs first-half
  lastPlayed: string | null    // ISO date of most recent match
}

export type ProDossierMapStat = {
  mapName: string
  played: number
  wins: number
  winPct: number | null
  picked: number               // times this team picked the map
  pickedByOpp: number          // times opponent picked
  decider: number              // times neither picked (or unknown)
  atkWinPct: number | null     // their ATT-half win rate on this map
  defWinPct: number | null     // their DEF-half win rate on this map
  topAgents: { agent: string; count: number }[]  // top agents on this map
}

export type ProDossierPlayer = {
  playerId: string
  ign: string
  country: string | null
  primaryRole: AgentRole | null
  agentsCount: number
  signatureAgent: { agent: string; role: AgentRole | null; count: number } | null
  // Averages across all their maps with this team
  avgAcs: number | null
  avgK: number | null
  avgD: number | null
  avgA: number | null
  avgPlusMinus: number | null
  maps: number                 // how many maps they played
  topAgents: { agent: string; count: number }[]
}

export type ProDossierComp = {
  agents: string[]             // 5 agents in role order
  archetype: string            // e.g. "Duelist Double-Init"
  played: number
  wins: number
  winPct: number | null
  maps: string[]               // which maps used this comp
}

export type ProTacticalPatterns = {
  // Round-economy proxies — derived from end_type + winner
  pistolPlayed: number
  pistolWins: number
  pistolWinPct: number | null
  // Anti-eco / eco / bonus rounds need econ data we don't have from VLR.
  // We have these via round-type approximations (e.g. round 2 = pistol-carry).
  bonusRoundPlayed: number     // round 2 + 14 (pistol-carry)
  bonusRoundWins: number
  bonusRoundWinPct: number | null
  // Plant rate when on ATTACK
  plantRateAtk: number | null  // % of their ATK rounds where a plant happened
  plantAtkN: number
  // Comeback / closeout rates
  closeoutRate: number | null  // % of maps they won when leading half-time
  comebackRate: number | null  // % of maps they won when trailing half-time
  // OT performance
  otPlayed: number
  otWins: number
  // First-blood differential (sample if VLR exposed it; usually null for VCT CN)
  fkFdDiff: number | null
}

export type ProDossierMatch = {
  matchId: string
  vlrMatchId: number
  url: string | null
  date: string | null
  opponentName: string
  opponentTeamId: string
  result: 'W' | 'L' | 'T'
  teamScore: number            // series maps won
  oppScore: number
  eventName: string | null
  eventStage: string | null
  maps: { mapName: string; teamScore: number; oppScore: number }[]
}

export type ProDossierRoleBaseline = {
  role: AgentRole
  n: number                    // # of player-map rows in baseline
  acsP50: number | null
  acsP25: number | null
  acsP75: number | null
}

export type ProTeamDossier = {
  team: ProTeamSummary
  scope: { label: string; eventNames: string[]; matchCount: number }
  form: ProDossierForm
  maps: ProDossierMapStat[]
  roster: ProDossierPlayer[]
  topComps: ProDossierComp[]
  tactics: ProTacticalPatterns
  recentMatches: ProDossierMatch[]
  roleBaselines: ProDossierRoleBaseline[]
}

// ── Player dossier ─────────────────────────────────────────────────────────

export type PercentileCategory = 'firepower' | 'impact' | 'survival' | 'consistency'

export type PercentileSlice = {
  key: string                  // stable id, e.g. 'acs'
  label: string                // 'ACS'
  category: PercentileCategory
  value: number | null         // raw value (for tooltip)
  percentile: number | null    // 0..100 vs role peers
  higherBetter: boolean
}

export type SimilarPlayer = {
  ign: string
  teamId: string | null
  teamName: string | null
  primaryRole: AgentRole | null
  signatureAgent: string | null
  avgAcs: number | null
  similarity: number           // 0..1 cosine on percentile vector
  maps: number
}

export type AgentMapCell = {
  agent: string
  mapName: string
  sample: number               // # of maps played on (agent, map)
  avgAcs: number | null
  avgPlusMinus: number | null
  wins: number
  played: number
  winPct: number | null
}

export type RecentFormEntry = {
  mapResultId: string
  date: string | null
  mapName: string
  agent: string | null
  opponentName: string | null
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
  plusMinus: number | null
  result: 'W' | 'L' | 'T'
  matchUrl: string | null
}

export type PeerScatterPoint = {
  ign: string
  teamName: string | null
  primaryRole: AgentRole | null
  x: number                    // K/D ratio
  y: number                    // ACS
  maps: number
  isFocal: boolean
}

export type ProPlayerSummary = {
  ign: string
  realName: string | null
  country: string | null
  teamId: string | null
  teamName: string | null
  teamTag: string | null
  teamSlug: string | null
  primaryRole: AgentRole | null
  signatureAgent: { agent: string; count: number } | null
  topAgents: { agent: string; count: number }[]
}

export type ProPlayerCareer = {
  matches: number              // distinct series
  maps: number                 // distinct maps played
  wins: number
  losses: number
  winPct: number | null
  avgAcs: number | null
  avgK: number | null
  avgD: number | null
  avgA: number | null
  avgPlusMinus: number | null
  avgFk: number | null
  kdRatio: number | null
  lastPlayed: string | null
}

export type ProPlayerDossier = {
  player: ProPlayerSummary
  career: ProPlayerCareer
  sample: 'ok' | 'small'       // 'small' if <5 maps with stats
  slices: PercentileSlice[]    // ~10 stats, ordered for radar
  topPercentiles: PercentileSlice[]  // top 5 by percentile desc
  similarPlayers: SimilarPlayer[]    // up to 12
  agentMapGrid: {
    agents: string[]           // row order
    maps: string[]             // col order
    cells: AgentMapCell[]
    maxAcs: number | null      // for color scale
    minAcs: number | null
  }
  peerScatter: PeerScatterPoint[]    // role peers + focal
  recentForm: RecentFormEntry[]      // last 10
}
