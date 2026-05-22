/**
 * Probe computeTeamDossier on a real team in the DB.
 *
 * Usage:
 *   npx tsx scripts/probe-dossier.mts                  # defaults to AG
 *   npx tsx scripts/probe-dossier.mts --team <uuid>
 *   npx tsx scripts/probe-dossier.mts --vlr 1119       # by VLR team id
 */

import { createAdminClient } from '../src/lib/supabase/admin'
import { computeTeamDossier } from '../src/lib/pro-scout/dossier'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const sb = createAdminClient()

  let teamId: string | undefined = arg('--team')
  const vlrId = arg('--vlr')

  if (!teamId) {
    const { data } = await sb
      .from('pro_teams')
      .select('id, name')
      .eq('vlr_team_id', vlrId ? Number(vlrId) : 1119)
      .single()
    teamId = data?.id
    if (!teamId) {
      console.error('team not found')
      process.exit(1)
    }
    console.error(`Using team: ${data?.name} (${teamId})`)
  }

  const d = await computeTeamDossier(sb, teamId!)
  if (!d) {
    console.error('dossier returned null')
    process.exit(1)
  }

  console.log('═══ TEAM ═══')
  console.log(`  ${d.team.name}  (vlr ${d.team.vlrTeamId}, region ${d.team.region})`)
  console.log(`  scope: ${d.scope.label}  (${d.scope.matchCount} matches)`)
  console.log()

  console.log('═══ FORM ═══')
  console.log(`  Series:  ${d.form.seriesWins}-${d.form.seriesLosses}  (${d.form.seriesWinPct}%)`)
  console.log(`  Maps:    ${d.form.mapWins}-${d.form.mapLosses}  (${d.form.mapWinPct}%)`)
  console.log(`  Recent:  ${d.form.recentForm}`)
  console.log(`  Trend:   ${d.form.trendDelta != null ? `${d.form.trendDelta > 0 ? '+' : ''}${d.form.trendDelta}pp` : '—'}  (map-win % delta, recent vs older)`)
  console.log(`  Last:    ${d.form.lastPlayed}`)
  console.log()

  console.log('═══ MAPS ═══')
  for (const m of d.maps) {
    console.log(
      `  ${m.mapName.padEnd(10)} n=${m.played}  W%=${m.winPct ?? '—'}  ` +
        `pick=${m.picked} oppPick=${m.pickedByOpp} dec=${m.decider}  ` +
        `atk=${m.atkWinPct ?? '—'}%/def=${m.defWinPct ?? '—'}%`
    )
    if (m.topAgents.length) {
      console.log(`             agents: ${m.topAgents.slice(0, 6).map(a => `${a.agent}×${a.count}`).join(', ')}`)
    }
  }
  console.log()

  console.log('═══ ROSTER ═══')
  for (const p of d.roster) {
    console.log(
      `  ${p.ign.padEnd(14)} ${(p.primaryRole ?? '—').padEnd(11)} ` +
        `ACS=${p.avgAcs ?? '—'}  K/D/A=${p.avgK}/${p.avgD}/${p.avgA}  +/-=${p.avgPlusMinus}  ` +
        `n=${p.maps} maps  sig: ${p.signatureAgent?.agent ?? '—'}×${p.signatureAgent?.count ?? 0}`
    )
  }
  console.log()

  console.log('═══ TOP COMPS ═══')
  for (const c of d.topComps.slice(0, 5)) {
    console.log(
      `  [${c.archetype}] ${c.agents.join(', ')}  n=${c.played} W=${c.wins} (${c.winPct}%)  maps: ${c.maps.join(', ')}`
    )
  }
  console.log()

  console.log('═══ TACTICS ═══')
  console.log(`  Pistol W%:        ${d.tactics.pistolWinPct ?? '—'}%  (${d.tactics.pistolWins}/${d.tactics.pistolPlayed})`)
  console.log(`  Bonus-round W%:   ${d.tactics.bonusRoundWinPct ?? '—'}%  (${d.tactics.bonusRoundWins}/${d.tactics.bonusRoundPlayed})`)
  console.log(`  Plant rate (ATK): ${d.tactics.plantRateAtk ?? '—'}%  (n=${d.tactics.plantAtkN} atk rounds)`)
  console.log(`  Closeout rate:    ${d.tactics.closeoutRate ?? '—'}%  (when leading 1H)`)
  console.log(`  Comeback rate:    ${d.tactics.comebackRate ?? '—'}%  (when trailing 1H)`)
  console.log(`  OT:               ${d.tactics.otWins}/${d.tactics.otPlayed} maps`)
  console.log(`  FK-FD diff:       ${d.tactics.fkFdDiff ?? '—'}`)
  console.log()

  console.log('═══ ROLE BASELINES (full league) ═══')
  for (const b of d.roleBaselines) {
    console.log(`  ${b.role.padEnd(11)} n=${b.n}  p25=${b.acsP25?.toFixed(0)} p50=${b.acsP50?.toFixed(0)} p75=${b.acsP75?.toFixed(0)}`)
  }
  console.log()

  console.log('═══ RECENT MATCHES ═══')
  for (const m of d.recentMatches.slice(0, 10)) {
    console.log(
      `  ${m.date} ${m.result} ${m.teamScore}-${m.oppScore}  vs ${m.opponentName}  (${m.eventStage ?? '—'})`
    )
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
