import { createHash, randomBytes } from 'crypto'

export const INVITE_PREFIX = 'inv_'

export function hashInviteToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Generate an invite token. Same shape as capture tokens (160 bits base32)
 * but with the `inv_` prefix so leaks are scannable.
 */
export function generateInviteToken(): { plaintext: string; hash: string } {
  const buf = randomBytes(20)
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
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
  const plaintext = `${INVITE_PREFIX}${body}`
  return { plaintext, hash: hashInviteToken(plaintext) }
}
