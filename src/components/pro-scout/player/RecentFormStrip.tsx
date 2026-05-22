import type { RecentFormEntry } from '@/lib/pro-scout/types'

function cleanTeamName(name: string | null): string {
  if (!name) return '—'
  const m = name.match(/^.+\s*\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : name.trim()
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })
}

export default function RecentFormStrip({ entries }: { entries: RecentFormEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-2">no recent maps</p>
  }
  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <a
          key={e.mapResultId}
          href={e.matchUrl ?? '#'}
          target={e.matchUrl ? '_blank' : undefined}
          rel="noopener"
          className="grid grid-cols-[auto_auto_auto_1fr_auto_auto] gap-3 items-center text-xs px-3 py-2 rounded-md bg-surface hover:bg-surface-3 transition-colors"
        >
          <span className="font-mono text-muted tnum w-14">{fmtDate(e.date)}</span>
          <span
            className={`font-bold w-5 text-center ${
              e.result === 'W'
                ? 'text-win-green'
                : e.result === 'L'
                ? 'text-crimson'
                : 'text-muted-2'
            }`}
          >
            {e.result}
          </span>
          <span className="text-fg w-20 truncate">{e.mapName}</span>
          <span className="text-muted truncate">
            vs {cleanTeamName(e.opponentName)}
            {e.agent && (
              <span className="text-2xs text-gold ml-2">{e.agent}</span>
            )}
          </span>
          <span className="font-mono tnum text-fg">
            {e.acs ?? '—'} <span className="text-2xs text-muted-2">ACS</span>
          </span>
          <span className="font-mono tnum text-muted w-20 text-right">
            {e.k ?? '—'}/{e.d ?? '—'}/{e.a ?? '—'}
            <span
              className={`ml-1 ${
                (e.plusMinus ?? 0) > 0
                  ? 'text-win-green'
                  : (e.plusMinus ?? 0) < 0
                  ? 'text-crimson'
                  : 'text-muted-2'
              }`}
            >
              {e.plusMinus == null
                ? ''
                : `(${e.plusMinus > 0 ? '+' : ''}${e.plusMinus})`}
            </span>
          </span>
        </a>
      ))}
    </div>
  )
}
