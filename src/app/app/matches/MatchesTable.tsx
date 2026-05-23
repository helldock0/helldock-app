'use client'

import { useRouter } from 'next/navigation'

type Match = {
  id: string
  match_id_helldock: string
  match_date: string
  match_type: string | null
  opponent_name: string | null
  map_name: string | null
  our_score: number | null
  opp_score: number | null
  result: string | null
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MatchesTable({ matches }: { matches: Match[] }) {
  const router = useRouter()

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-end">
        <p className="text-2xs text-muted-2 uppercase tracking-wider tnum">
          {matches.length} shown
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-10 text-center">
          <p className="text-muted text-sm mb-4">no matches logged yet</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push('/app/import')}
              className="text-gold text-sm font-medium hover:underline"
            >
              import some
            </button>
            <span className="text-muted-2 text-xs">·</span>
            <button
              onClick={() => router.push('/app/matches/new')}
              className="text-gold text-sm font-medium hover:underline"
            >
              + new match
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
                <th className="text-left px-4 py-3 font-semibold">ID</th>
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-left px-4 py-3 font-semibold">Opponent</th>
                <th className="text-left px-4 py-3 font-semibold">Map</th>
                <th className="text-center px-4 py-3 font-semibold">Score</th>
                <th className="text-center px-4 py-3 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match, i) => (
                <tr
                  key={match.id}
                  onClick={() => router.push(`/app/matches/${match.match_id_helldock}`)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(`/app/matches/${match.match_id_helldock}`)
                    }
                  }}
                  className={`
                    group cursor-pointer outline-none
                    transition-colors duration-150
                    hover:bg-surface-3 focus-visible:bg-surface-3
                    ${i !== matches.length - 1 ? 'border-b border-line' : ''}
                  `}
                >
                  <td className="px-4 py-3 font-mono text-gold tnum relative">
                    <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold scale-y-0 group-hover:scale-y-100 group-focus-visible:scale-y-100 origin-center transition-transform duration-200" />
                    {match.match_id_helldock}
                  </td>
                  <td className="px-4 py-3 text-muted tnum">{formatDate(match.match_date)}</td>
                  <td className="px-4 py-3 text-fg">{match.match_type ?? '—'}</td>
                  <td className="px-4 py-3 text-fg font-medium">{match.opponent_name ?? '—'}</td>
                  <td className="px-4 py-3 text-fg">{match.map_name ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-mono tnum">
                    {match.our_score != null && match.opp_score != null
                      ? `${match.our_score} – ${match.opp_score}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-bold">
                    {match.result === 'W' ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-win-green/15 text-win-green">
                        W
                      </span>
                    ) : match.result === 'L' ? (
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-crimson/15 text-crimson">
                        L
                      </span>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
