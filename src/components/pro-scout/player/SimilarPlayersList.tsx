import Link from 'next/link'
import IgnAvatar from './IgnAvatar'
import type { SimilarPlayer } from '@/lib/pro-scout/types'

function cleanTeamName(name: string | null): string {
  if (!name) return '—'
  const m = name.match(/^.+\s*\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : name.trim()
}

const defaultHref = (p: SimilarPlayer) =>
  `/pro-scout/players/${encodeURIComponent(p.ign)}`

export default function SimilarPlayersList({
  players,
  hrefFor = defaultHref,
  accent = '#FFD700',
}: {
  players: SimilarPlayer[]
  hrefFor?: (p: SimilarPlayer) => string
  accent?: string
}) {
  if (players.length === 0) {
    return <p className="text-2xs text-muted-2">no comparable peers</p>
  }
  return (
    <ul className="space-y-1.5">
      {players.map((p) => {
        const href = hrefFor(p)
        const Wrapper = ({ children }: { children: React.ReactNode }) =>
          href && href !== '#' ? (
            <Link href={href} className="contents">{children}</Link>
          ) : (
            <>{children}</>
          )
        return (
        <li key={`${p.ign}-${p.teamId ?? 'na'}`}>
          <Wrapper>
          <div
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-3 transition-colors"
          >
            <IgnAvatar ign={p.ign} size={28} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-fg truncate group-hover:text-gold">
                {p.ign}
              </div>
              <div className="text-2xs text-muted-2 truncate">
                {cleanTeamName(p.teamName)}
                {p.signatureAgent && ` · ${p.signatureAgent}`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className="font-mono tnum text-sm font-bold"
                style={{ color: accent }}
              >
                {Math.round(p.similarity * 100)}%
              </div>
              <div className="text-2xs text-muted-2 tnum">
                {p.avgAcs ?? '—'} ACS
              </div>
            </div>
          </div>
          </Wrapper>
        </li>
        )
      })}
    </ul>
  )
}
