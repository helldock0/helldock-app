export const MAPS = [
  'Ascent',
  'Bind',
  'Haven',
  'Split',
  'Icebox',
  'Breeze',
  'Fracture',
  'Pearl',
  'Lotus',
  'Sunset',
  'Abyss',
] as const

export const AGENTS = [
  'Astra',
  'Breach',
  'Brimstone',
  'Chamber',
  'Clove',
  'Cypher',
  'Deadlock',
  'Fade',
  'Gekko',
  'Harbor',
  'Iso',
  'Jett',
  'KAY/O',
  'Killjoy',
  'Neon',
  'Omen',
  'Phoenix',
  'Raze',
  'Reyna',
  'Sage',
  'Skye',
  'Sova',
  'Tejo',
  'Viper',
  'Vyse',
  'Waylay',
  'Yoru',
] as const

export const MATCH_TYPES = [
  'Scrim',
  'Tournament',
  'Premier',
  'Practice',
  'Internal Scrim',
] as const

export const PICKS = ['Our Pick', 'Their Pick', 'Decider'] as const

export const SIDES = ['Attack', 'Defense'] as const

export type Map = (typeof MAPS)[number]
export type Agent = (typeof AGENTS)[number]
export type MatchType = (typeof MATCH_TYPES)[number]
export type Pick = (typeof PICKS)[number]
export type Side = (typeof SIDES)[number]

export type Role = 'Duelist' | 'Initiator' | 'Controller' | 'Sentinel'

export const AGENT_TO_ROLE: Record<string, Role> = {
  Jett: 'Duelist',
  Phoenix: 'Duelist',
  Reyna: 'Duelist',
  Raze: 'Duelist',
  Yoru: 'Duelist',
  Neon: 'Duelist',
  Iso: 'Duelist',
  Waylay: 'Duelist',
  Brimstone: 'Controller',
  Omen: 'Controller',
  Viper: 'Controller',
  Astra: 'Controller',
  Harbor: 'Controller',
  Clove: 'Controller',
  Cypher: 'Sentinel',
  Killjoy: 'Sentinel',
  Sage: 'Sentinel',
  Chamber: 'Sentinel',
  Deadlock: 'Sentinel',
  Vyse: 'Sentinel',
  Sova: 'Initiator',
  Breach: 'Initiator',
  Skye: 'Initiator',
  'KAY/O': 'Initiator',
  Fade: 'Initiator',
  Gekko: 'Initiator',
  Tejo: 'Initiator',
}
