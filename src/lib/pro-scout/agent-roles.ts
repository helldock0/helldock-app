/**
 * Static agent → role mapping for VCT 2026.
 * Used to classify players by primary role from their agent picks.
 */

export type AgentRole = 'Duelist' | 'Controller' | 'Initiator' | 'Sentinel'

const ROLE_MAP: Record<string, AgentRole> = {
  // Duelists
  Jett: 'Duelist',
  Raze: 'Duelist',
  Phoenix: 'Duelist',
  Reyna: 'Duelist',
  Yoru: 'Duelist',
  Neon: 'Duelist',
  Iso: 'Duelist',
  Waylay: 'Duelist',

  // Controllers
  Brimstone: 'Controller',
  Viper: 'Controller',
  Omen: 'Controller',
  Astra: 'Controller',
  Harbor: 'Controller',
  Clove: 'Controller',

  // Initiators
  Sova: 'Initiator',
  Skye: 'Initiator',
  Fade: 'Initiator',
  Breach: 'Initiator',
  'KAY/O': 'Initiator',
  Kayo: 'Initiator',
  Gekko: 'Initiator',
  Tejo: 'Initiator',

  // Sentinels
  Killjoy: 'Sentinel',
  Cypher: 'Sentinel',
  Sage: 'Sentinel',
  Chamber: 'Sentinel',
  Deadlock: 'Sentinel',
  Vyse: 'Sentinel',
}

export function roleForAgent(agent: string | null | undefined): AgentRole | null {
  if (!agent) return null
  // VLR sometimes uses lowercase from `alt` attr; normalize.
  const key = agent.trim()
  if (ROLE_MAP[key]) return ROLE_MAP[key]
  const titled = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
  return ROLE_MAP[titled] ?? null
}
