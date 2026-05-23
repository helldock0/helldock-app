import type { CoachSummary } from '@/lib/analytics'

function Card({
  title,
  children,
  accent = 'gold',
}: {
  title: string
  children: React.ReactNode
  accent?: 'gold' | 'crimson' | 'muted'
}) {
  const dot = accent === 'gold' ? 'bg-gold' : accent === 'crimson' ? 'bg-crimson' : 'bg-muted-2'
  return (
    <div className="bg-surface-2 border border-line-strong/40 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        <h3 className="text-2xs font-bold uppercase tracking-[0.18em] text-fg/85">
          {title}
        </h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Row({ label, value, tone = 'fg' }: { label: string; value: string; tone?: 'fg' | 'muted' | 'gold' | 'crimson' | 'green' }) {
  const valColor =
    tone === 'gold'
      ? 'text-gold'
      : tone === 'crimson'
      ? 'text-crimson'
      : tone === 'green'
      ? 'text-win-green'
      : tone === 'muted'
      ? 'text-muted'
      : 'text-fg'
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-2">{label}</span>
      <span className={`${valColor} tnum font-medium`}>{value}</span>
    </div>
  )
}

function recordStr(r: { wins: number; losses: number }): string {
  if (r.wins === 0 && r.losses === 0) return '—'
  return `${r.wins}-${r.losses}`
}

export default function CoachSummaryStrip({ summary }: { summary: CoachSummary }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {/* What to practice — crimson */}
      <Card title="What to practice" accent="crimson">
        <Row
          label="Worst map"
          value={
            summary.worstMap
              ? `${summary.worstMap.map} · ${summary.worstMap.winPct}%`
              : 'need 2+ per map'
          }
          tone="crimson"
        />
        <Row
          label="Worst side"
          value={summary.worstSide ?? '—'}
          tone="crimson"
        />
        <Row
          label="Worst round type"
          value={summary.worstRoundType ?? 'need 3+ rounds'}
          tone="crimson"
        />
        <Row
          label="Bottom (ACS)"
          value={
            summary.bottomPlayer
              ? `${summary.bottomPlayer.name} · ${summary.bottomPlayer.avgAcs}`
              : '—'
          }
          tone="muted"
        />
      </Card>

      {/* What to ride — gold */}
      <Card title="What to ride" accent="gold">
        <Row
          label="Best map"
          value={
            summary.bestMap
              ? `${summary.bestMap.map} · ${summary.bestMap.winPct}%`
              : 'need 2+ per map'
          }
          tone="gold"
        />
        <Row
          label="Top fragger"
          value={
            summary.topFragger
              ? `${summary.topFragger.name} · ${summary.topFragger.avgAcs}`
              : '—'
          }
          tone="green"
        />
        <Row
          label="Most logged opp"
          value={
            summary.mostLoggedOpp
              ? `${summary.mostLoggedOpp.name} ×${summary.mostLoggedOpp.count}`
              : '—'
          }
          tone="muted"
        />
        <Row
          label="🪨 Most depended on"
          value={
            summary.mostDepended
              ? `${summary.mostDepended.name} · +${summary.mostDepended.dragPp}pp drag`
              : 'balanced'
          }
          tone={summary.mostDepended ? 'crimson' : 'muted'}
        />
      </Card>

      {/* Recent form */}
      <Card title="Recent form">
        <Row label="Last 5" value={recordStr(summary.last5)} tone="gold" />
        <Row label="Last 10" value={recordStr(summary.last10)} tone="gold" />
        <Row
          label="This week"
          value={summary.thisWeek === 0 ? '—' : `${summary.thisWeek} scrims`}
          tone={summary.thisWeek > 0 ? 'fg' : 'muted'}
        />
        {summary.grading.gradedRoundsLast7d > 0 && (
          <>
            <Row
              label="Grade 4★+ (7d)"
              value={
                summary.grading.fourPlusPct == null
                  ? '—'
                  : `${summary.grading.fourPlusPct}% · n=${summary.grading.gradedRoundsLast7d}`
              }
              tone={
                summary.grading.fourPlusPct != null && summary.grading.fourPlusPct >= 60
                  ? 'green'
                  : 'fg'
              }
            />
            {summary.grading.topTags.length > 0 && (
              <div className="text-2xs text-muted-2 pt-1 leading-snug">
                tags:{' '}
                {summary.grading.topTags.map((t) => (
                  <span key={t.tag} className="text-gold mr-1.5">
                    {t.tag}
                    <span className="text-muted-2">×{t.count}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {(summary.afkFlag || summary.ffFlag) && (
          <div className="pt-2 mt-1 border-t border-crimson/30 space-y-1">
            {summary.afkFlag && (
              <div className="text-2xs text-crimson/90 leading-snug">
                ⚠ AFK: <span className="font-semibold">{summary.afkFlag.name}</span> ·{' '}
                {summary.afkFlag.rounds} rds (7d)
              </div>
            )}
            {summary.ffFlag && (
              <div className="text-2xs text-crimson/90 leading-snug">
                ⚠ FF: <span className="font-semibold">{summary.ffFlag.name}</span> ·{' '}
                {summary.ffFlag.damage} dmg (7d)
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Side bias */}
      <Card title="Side bias">
        <Row
          label="ATT %"
          value={summary.attPct == null ? '—' : `${summary.attPct}%`}
          tone="gold"
        />
        <Row
          label="DEF %"
          value={summary.defPct == null ? '—' : `${summary.defPct}%`}
          tone="crimson"
        />
        <Row
          label="Bias"
          value={
            summary.sideBias && summary.sideDelta != null
              ? `${summary.sideBias} · Δ${summary.sideDelta > 0 ? '+' : ''}${summary.sideDelta}`
              : '—'
          }
          tone={
            summary.sideBias === 'ATT-leaning'
              ? 'gold'
              : summary.sideBias === 'DEF-leaning'
              ? 'crimson'
              : 'fg'
          }
        />
      </Card>
    </div>
  )
}
