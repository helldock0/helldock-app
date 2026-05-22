// Per-role accent for the FBref-style dossier sheets. Same role across
// pro-scout and internal pages produces the same color identity, so a
// duelist's page always reads as crimson and a sentinel's as teal.

import type { AgentRole } from '@/lib/pro-scout/agent-roles'

export const ROLE_ACCENT: Record<AgentRole, string> = {
  Duelist:    '#DC143C', // crimson — already in the palette
  Initiator:  '#FFD700', // gold — already in the palette
  Sentinel:   '#14B8A6', // teal
  Controller: '#A78BFA', // violet
}

const FLEX_ACCENT = '#FFD700'  // unknown role → gold (matches existing default)

export function roleAccent(role: AgentRole | null | undefined): string {
  if (!role) return FLEX_ACCENT
  return ROLE_ACCENT[role] ?? FLEX_ACCENT
}

// Category opacity tiers for the monochrome radar — subtly distinguishes
// the four stat groups without breaking the single-color identity.
export const CATEGORY_OPACITY = {
  firepower:   1.00,
  impact:      0.84,
  survival:    0.68,
  consistency: 0.52,
} as const
