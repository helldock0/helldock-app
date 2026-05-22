import Link from 'next/link'
import type { ProDossierPlayer, ProDossierRoleBaseline } from '@/lib/pro-scout/types'
import { roleAccent } from '@/lib/dossier/role-colors'

// Map ACS to a 0..100 width relative to the role's p25..p75 IQR. ACS at p25
// reads as ~0% bar, at p75 reads as ~100% bar, above p75 caps at 100% (the
// numeric label still shows the actual value + delta).
function barPctFromBaseline(
  acs: number | null,
  baseline: ProDossierRoleBaseline | null
): number {
  if (acs == null) return 0
  if (!baseline || baseline.acsP25 == null || baseline.acsP75 == null) {
    // No baseline yet — fall back to a fixed 100-300 ACS scale
    return Math.max(0, Math.min(100, ((acs - 100) / 200) * 100))
  }
  const lo = baseline.acsP25
  const hi = baseline.acsP75
  if (hi <= lo) return 50
  return Math.max(2, Math.min(100, ((acs - lo) / (hi - lo)) * 100))
}

function deltaText(delta: number | null): string {
  if (delta == null) return '—'
  return `${delta > 0 ? '+' : ''}${delta}`
}

function deltaTone(delta: number | null): string {
  if (delta == null) return 'text-muted-2'
  if (delta >= 15) return 'text-win-green'
  if (delta >= 0) return 'text-gold'
  if (delta >= -15) return 'text-fg'
  return 'text-crimson'
}

export default function RosterTable({
  roster,
  baselines,
}: {
  roster: ProDossierPlayer[]
  baselines: ProDossierRoleBaseline[]
}) {
  const baselineByRole = new Map(baselines.map((b) => [b.role, b]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-separate" style={{ borderSpacing: '0 4px' }}>
        <thead>
          <tr className="text-2xs uppercase tracking-wider text-muted-2">
            <th className="text-left py-1 font-medium">Player</th>
            <th className="text-left py-1 font-medium hidden sm:table-cell">Sig</th>
            <th className="text-left py-1 font-medium pl-4">ACS vs role IQR</th>
            <th className="text-right py-1 font-medium">K/D/A</th>
            <th className="text-right py-1 font-medium">+/-</th>
            <th className="text-right py-1 font-medium hidden sm:table-cell">Maps</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((p) => {
            const accent = roleAccent(p.primaryRole)
            const baseline = p.primaryRole ? baselineByRole.get(p.primaryRole) ?? null : null
            const barPct = barPctFromBaseline(p.avgAcs, baseline)
            const delta =
              baseline?.acsP50 != null && p.avgAcs != null
                ? Math.round((p.avgAcs - baseline.acsP50) * 10) / 10
                : null
            return (
              <tr
                key={p.playerId}
                className="bg-surface hover:bg-surface-3 transition-colors"
                style={{
                  // Subtle role-tinted left border via box-shadow inset on the
                  // first cell; keeps the row visually grouped by role.
                  boxShadow: `inset 3px 0 0 ${accent}`,
                }}
              >
                <td className="py-2 pl-3">
                  <Link
                    href={`/pro-scout/players/${encodeURIComponent(p.ign)}`}
                    className="font-medium text-fg hover:text-gold transition-colors"
                  >
                    {p.ign}
                  </Link>
                  <div className="text-2xs uppercase tracking-wider mt-0.5" style={{ color: accent }}>
                    {p.primaryRole ?? 'flex'}
                  </div>
                </td>
                <td className="py-2 text-muted hidden sm:table-cell">
                  {p.signatureAgent ? (
                    <span>
                      {p.signatureAgent.agent}
                      <span className="text-2xs text-muted-2 ml-1">×{p.signatureAgent.count}</span>
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 pl-4 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden relative">
                      {/* p50 marker tick */}
                      {baseline?.acsP25 != null && baseline.acsP50 != null && baseline.acsP75 != null && baseline.acsP75 > baseline.acsP25 && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-fg/40"
                          style={{
                            left: `${((baseline.acsP50 - baseline.acsP25) / (baseline.acsP75 - baseline.acsP25)) * 100}%`,
                          }}
                        />
                      )}
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${barPct}%`, backgroundColor: accent }}
                      />
                    </div>
                    <span className="font-mono tnum text-xs text-fg w-10 text-right">
                      {p.avgAcs ?? '—'}
                    </span>
                    <span className={`font-mono tnum text-2xs w-12 text-right ${deltaTone(delta)}`}>
                      {deltaText(delta)}
                    </span>
                  </div>
                </td>
                <td className="py-2 text-right tnum text-muted text-xs">
                  {p.avgK ?? '—'}/{p.avgD ?? '—'}/{p.avgA ?? '—'}
                </td>
                <td
                  className={`py-2 text-right tnum text-xs ${
                    (p.avgPlusMinus ?? 0) > 0
                      ? 'text-win-green'
                      : (p.avgPlusMinus ?? 0) < 0
                      ? 'text-crimson'
                      : 'text-muted'
                  }`}
                >
                  {(p.avgPlusMinus ?? 0) > 0 ? '+' : ''}
                  {p.avgPlusMinus ?? '—'}
                </td>
                <td className="py-2 pr-3 text-right tnum text-muted-2 text-xs hidden sm:table-cell">
                  {p.maps}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-2xs uppercase tracking-wider text-muted-2">
        bar = ACS within role p25–p75 baseline · tick = p50 · delta shown vs p50
      </p>
    </div>
  )
}
