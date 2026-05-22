/**
 * Parsed representations of VLR.gg pages. Mirror the shape the scrapers
 * produce, not the DB shape (ingest.ts maps these → DB rows).
 */

export type VlrTeamRef = {
  vlrTeamId: number
  name: string
  tag: string | null
  slug: string | null
  url: string
}

export type VlrPlayerRef = {
  vlrPlayerId: number | null
  ign: string
  country: string | null
  url: string | null
}

export type VlrPlayerMapStats = {
  player: VlrPlayerRef
  teamSide: 'a' | 'b'              // which team in the match they played for
  agent: string | null
  rating: number | null
  acs: number | null
  k: number | null
  d: number | null
  a: number | null
  plusMinus: number | null
  kast: number | null              // 0-100
  adr: number | null
  hsPct: number | null             // 0-100
  fk: number | null
  fd: number | null
  fkFdDiff: number | null
  acsAtk: number | null
  acsDef: number | null
  kAtk: number | null
  kDef: number | null
  dAtk: number | null
  dDef: number | null
}

export type VlrRound = {
  roundNum: number
  half: '1st' | '2nd' | 'OT'
  winnerSide: 'a' | 'b'            // which team won
  endType: 'elim' | 'defuse' | 'detonate' | 'time' | null
  plantHappened: boolean | null
  teamASide: 'Attack' | 'Defense' | null
  teamBSide: 'Attack' | 'Defense' | null
}

export type VlrMapResult = {
  mapOrder: number
  mapName: string
  pickedBy: 'a' | 'b' | null
  teamAScore: number
  teamBScore: number
  teamAAtkScore: number | null
  teamADefScore: number | null
  teamBAtkScore: number | null
  teamBDefScore: number | null
  teamAStartSide: 'Attack' | 'Defense' | null
  winnerSide: 'a' | 'b' | null
  durationMinutes: number | null
  players: VlrPlayerMapStats[]
  rounds: VlrRound[]
}

export type VlrMatch = {
  vlrMatchId: number
  url: string
  eventName: string | null
  eventStage: string | null
  eventVlrId: number | null
  format: 'Bo1' | 'Bo3' | 'Bo5' | null
  matchDate: string | null         // YYYY-MM-DD
  matchDatetime: string | null     // ISO
  patch: string | null
  teamA: VlrTeamRef
  teamB: VlrTeamRef
  teamAScore: number               // maps won
  teamBScore: number
  winnerSide: 'a' | 'b' | null
  maps: VlrMapResult[]
}

export type VlrEventMeta = {
  vlrEventId: number
  name: string
  url: string
  region: string | null
  prizePool: string | null
  startDate: string | null
  endDate: string | null
}

export type VlrEventMatchSummary = {
  vlrMatchId: number
  url: string
  stage: string | null
  date: string | null
  teamAName: string
  teamBName: string
  completed: boolean
}
