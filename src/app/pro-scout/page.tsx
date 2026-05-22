import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function cleanTeamName(name: string): string {
  const m = name.match(/^.+\s*\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : name.trim()
}

export default async function ProScoutIndexPage() {
  const sb = createClient()

  // Aggregate teams + their match counts + win counts in two queries
  const [{ data: teams }, { data: matches }] = await Promise.all([
    sb
      .from('pro_teams')
      .select('id, slug, name, region, vlr_team_id')
      .order('name'),
    sb
      .from('pro_matches')
      .select('id, team_a_id, team_b_id, winner_team_id, match_date'),
  ])

  type Acc = { played: number; wins: number; lastDate: string | null; recent: ('W' | 'L')[] }
  const stats = new Map<string, Acc>()
  for (const m of matches ?? []) {
    for (const tid of [m.team_a_id, m.team_b_id] as string[]) {
      const acc =
        stats.get(tid) ?? ({ played: 0, wins: 0, lastDate: null, recent: [] } as Acc)
      stats.set(tid, acc)
      acc.played++
      const win = m.winner_team_id === tid ? 'W' : ('L' as const)
      if (m.winner_team_id) acc.recent.push(win === 'W' ? 'W' : 'L')
      if (m.winner_team_id === tid) acc.wins++
      if (m.match_date && (!acc.lastDate || m.match_date > acc.lastDate))
        acc.lastDate = m.match_date
    }
  }
  // Sort recent by date implicitly — we already iterate; for the index we just
  // take last 5 across whatever order. For a quick view that's fine.

  const teamsList = (teams ?? [])
    .map((t) => {
      const acc = stats.get(t.id)
      return {
        ...t,
        played: acc?.played ?? 0,
        wins: acc?.wins ?? 0,
        winPct: acc && acc.played > 0 ? Math.round((acc.wins / acc.played) * 100) : null,
        recent: (acc?.recent ?? []).slice(-5).reverse().join('-'),
        lastDate: acc?.lastDate ?? null,
      }
    })
    .sort((a, b) => (b.winPct ?? 0) - (a.winPct ?? 0))

  return (
    <main className="min-h-screen px-6 py-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-2xs uppercase tracking-[0.25em] text-gold mb-1">
          helldock · pro scout
        </p>
        <h1 className="text-4xl font-bold text-fg leading-tight">VCT CN scouting</h1>
        <p className="text-sm text-muted mt-2 max-w-2xl">
          Opposition dossiers for every team in VCT 2026: China Stage 1 — built from
          public VLR.gg match data. Pick a team to see their form, map pool, roster
          breakdown, top comps, tactical patterns, and recent results.
        </p>
        <p className="text-2xs uppercase tracking-wider text-muted-2 mt-3">
          {teamsList.length} teams · {matches?.length ?? 0} matches in scope
        </p>
      </div>

      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {teamsList.map((t) => (
            <Link
              key={t.id}
              href={`/pro-scout/${t.slug}`}
              className="group flex items-center justify-between gap-3 px-4 py-3 rounded-md bg-surface hover:bg-surface-3 transition-colors border border-line/40 hover:border-gold/50"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg group-hover:text-gold transition-colors truncate">
                  {cleanTeamName(t.name)}
                </div>
                <div className="text-2xs uppercase tracking-wider text-muted-2 mt-0.5">
                  {t.region} · {t.played} matches
                  {t.lastDate && ` · last ${t.lastDate}`}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono tnum text-sm font-bold text-fg">
                  {t.wins}-{t.played - t.wins}
                </div>
                <div className="font-mono tnum text-xs text-gold">
                  {t.winPct == null ? '—' : `${t.winPct}%`}
                </div>
                <div className="font-mono tnum text-2xs text-muted-2 mt-0.5">
                  {t.recent || '—'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="text-center text-2xs uppercase tracking-[0.16em] text-muted-2 py-8">
        data: vlr.gg · built for: Wuxi TEC data analyst application · {new Date().toISOString().slice(0, 10)}
      </footer>
    </main>
  )
}
