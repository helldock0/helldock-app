'use client'

import Link from 'next/link'
import type { MapPoolEntry } from '@/lib/analytics'

const TIER_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  S: { bg: 'bg-win-green/15', text: 'text-win-green', border: 'border-win-green/40', label: 'Permanent Pick' },
  A: { bg: 'bg-gold/15', text: 'text-gold', border: 'border-gold/40', label: 'Strong Pick' },
  B: { bg: 'bg-blue-400/15', text: 'text-blue-300', border: 'border-blue-400/40', label: 'Coin Flip' },
  C: { bg: 'bg-crimson/15', text: 'text-crimson', border: 'border-crimson/40', label: 'Permanent Ban' },
  DEV: { bg: 'bg-surface', text: 'text-muted', border: 'border-line-strong', label: 'Need more reps' },
}

const REC_COLOR: Record<string, string> = {
  Pick: 'text-win-green',
  Decider: 'text-blue-300',
  Ban: 'text-crimson',
  Develop: 'text-muted',
}

export default function MapPoolTab({ pool }: { pool: MapPoolEntry[] }) {
  return (
    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-2xs uppercase tracking-[0.16em] text-muted-2">
            <th className="text-left px-4 py-3 font-semibold w-16">Tier</th>
            <th className="text-left px-4 py-3 font-semibold">Map</th>
            <th className="text-center px-4 py-3 font-semibold">Played</th>
            <th className="text-center px-4 py-3 font-semibold">Record</th>
            <th className="text-right px-4 py-3 font-semibold">Win %</th>
            <th className="text-right px-4 py-3 font-semibold">Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {pool.map((p, i) => {
            const t = TIER_STYLES[p.tier]
            return (
              <tr
                key={p.map}
                className={`transition-colors hover:bg-surface-3 ${
                  i !== pool.length - 1 ? 'border-b border-line' : ''
                }`}
              >
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center justify-center w-9 h-7 rounded font-bold text-xs border ${t.bg} ${t.text} ${t.border}`}
                  >
                    {p.tier}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg font-medium">
                  {p.played > 0 ? (
                    <Link
                      href={`/app/analytics?tab=complab&map=${encodeURIComponent(p.map)}`}
                      className="hover:text-gold transition-colors"
                    >
                      {p.map}
                    </Link>
                  ) : (
                    <span className="text-muted">{p.map}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-muted tnum">{p.played}</td>
                <td className="px-4 py-3 text-center font-mono tnum">
                  {p.played > 0 ? (
                    <>
                      <span className="text-win-green">{p.wins}</span>
                      <span className="text-muted-2">–</span>
                      <span className="text-crimson">{p.losses}</span>
                    </>
                  ) : (
                    <span className="text-muted-2">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tnum text-gold font-medium">
                  {p.winPct == null ? '—' : `${p.winPct}%`}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs uppercase tracking-wider ${REC_COLOR[p.recommendation]}`}>
                    {p.recommendation}
                  </span>
                  <span className="text-2xs text-muted-2 ml-2">{t.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
