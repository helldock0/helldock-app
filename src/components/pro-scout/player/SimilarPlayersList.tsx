import Link from 'next/link'
import IgnAvatar from './IgnAvatar'
import type { SimilarPlayer } from '@/lib/pro-scout/types'

function cleanTeamName(name: string | null): string {
  if (!name) return '—'
  const m = name.match(/^.+\s*\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : name.trim()
}

export default function SimilarPlayersList({ players }: { players: SimilarPlayer[] }) {
  if (players.length === 0) {
    return <p className="text-2xs text-muted-2">no comparable peers</p>
  }
  return (
    <ul className="space-y-1.5">
      {players.map((p) => (
        <li key={p.ign}>
          <Link
            href={`/pro-scout/players/${encodeURIComponent(p.ign)}`}
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
              <div className="font-mono tnum text-sm font-bold text-gold">
                {Math.round(p.similarity * 100)}%
              </div>
              <div className="text-2xs text-muted-2 tnum">
                {p.avgAcs ?? '—'} ACS
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
