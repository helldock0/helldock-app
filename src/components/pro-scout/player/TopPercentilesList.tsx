import type { PercentileCategory, PercentileSlice } from '@/lib/pro-scout/types'

const CATEGORY_COLOR: Record<PercentileCategory, string> = {
  firepower: '#FFD700',
  impact: '#DC143C',
  survival: '#34D399',
  consistency: '#60A5FA',
}

export default function TopPercentilesList({ slices }: { slices: PercentileSlice[] }) {
  if (slices.length === 0) {
    return <p className="text-2xs text-muted-2">not enough peers to rank</p>
  }
  return (
    <ul className="space-y-2.5">
      {slices.map((s) => (
        <li key={s.key}>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-fg">{s.label}</span>
            <span className="font-mono tnum text-muted">
              {s.value ?? '—'}
              <span className="text-muted-2 ml-2">p{s.percentile ?? '—'}</span>
            </span>
          </div>
          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${s.percentile ?? 0}%`,
                backgroundColor: CATEGORY_COLOR[s.category],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
