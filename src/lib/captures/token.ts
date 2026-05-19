import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_PREFIX = 'helldock_'

/** sha256 hex of a plaintext token. Stored in capture_tokens.token_hash. */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Generate a fresh capture token. Returns the plaintext (to show once in the UI)
 * and the hash (to persist). Format: `helldock_<32 base32 chars>` ~= 40 chars,
 * 160 bits of entropy. The `helldock_` prefix makes leaked tokens easy to spot
 * in logs and git diffs.
 */
export function generateToken(): { plaintext: string; hash: string } {
  // 20 bytes = 160 bits; base32-encode for URL-safe, case-insensitive readability.
  const buf = randomBytes(20)
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567' // RFC 4648 base32, no padding
  let body = ''
  let bits = 0
  let value = 0
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i]
    bits += 8
    while (bits >= 5) {
      bits -= 5
      body += ALPHA[(value >> bits) & 0x1f]
    }
  }
  if (bits > 0) body += ALPHA[(value << (5 - bits)) & 0x1f]
  const plaintext = `${TOKEN_PREFIX}${body}`
  return { plaintext, hash: hashToken(plaintext) }
}

export type AuthenticatedToken = {
  tokenId: string
  label: string
  teamId: string
  teamSlug: string
  teamName: string
  playerId: string
  playerName: string
}

/**
 * Pull the bearer token off an `Authorization` header, look it up in
 * capture_tokens by sha256 hash, and resolve to team + player metadata.
 * Returns null on any failure (don't leak which step failed).
 *
 * On success, bumps `last_used_at` to NOW(). Caller should pass a service-role
 * client — RLS would otherwise hide tokens from anonymous callers.
 */
export async function authenticateToken(
  supabase: SupabaseClient,
  authHeader: string | null
): Promise<AuthenticatedToken | null> {
  if (!authHeader) return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const plaintext = m[1].trim()
  if (!plaintext.startsWith(TOKEN_PREFIX)) return null

  const tokenHash = hashToken(plaintext)
  const { data: row } = await supabase
    .from('capture_tokens')
    .select(`
      id, label, team_id, player_id,
      teams!inner(slug, name),
      players!inner(display_name)
    `)
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .maybeSingle()

  if (!row) return null

  // Fire-and-forget last_used_at bump (don't await — agent doesn't care)
  void supabase
    .from('capture_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)

  const teams = row.teams as unknown as { slug: string; name: string }
  const players = row.players as unknown as { display_name: string }

  return {
    tokenId: row.id,
    label: row.label,
    teamId: row.team_id,
    teamSlug: teams.slug,
    teamName: teams.name,
    playerId: row.player_id,
    playerName: players.display_name,
  }
}
