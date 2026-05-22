// Deterministic initials avatar: color is hashed from the IGN so the same
// player always gets the same circle. No CDN photos needed.

const PALETTE = [
  { bg: '#FFD700', fg: '#1B1B1F' }, // gold
  { bg: '#DC143C', fg: '#F5F5F7' }, // crimson
  { bg: '#34D399', fg: '#1B1B1F' }, // win-green
  { bg: '#60A5FA', fg: '#1B1B1F' }, // blue
  { bg: '#A78BFA', fg: '#1B1B1F' }, // violet
  { bg: '#F97316', fg: '#1B1B1F' }, // orange
  { bg: '#14B8A6', fg: '#1B1B1F' }, // teal
  { bg: '#F472B6', fg: '#1B1B1F' }, // pink
]

function hashIgn(ign: string): number {
  let h = 0
  for (let i = 0; i < ign.length; i++) {
    h = (h * 31 + ign.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function initials(ign: string): string {
  const cleaned = ign.replace(/[^a-z0-9]/gi, '')
  if (cleaned.length === 0) return '?'
  if (cleaned.length === 1) return cleaned[0].toUpperCase()
  return (cleaned[0] + cleaned[1]).toUpperCase()
}

export default function IgnAvatar({
  ign,
  size = 32,
}: {
  ign: string
  size?: number
}) {
  const { bg, fg } = PALETTE[hashIgn(ign) % PALETTE.length]
  return (
    <div
      className="inline-flex items-center justify-center rounded-full font-mono font-bold shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        color: fg,
        fontSize: Math.round(size * 0.4),
        letterSpacing: '-0.02em',
      }}
      aria-label={ign}
    >
      {initials(ign)}
    </div>
  )
}
