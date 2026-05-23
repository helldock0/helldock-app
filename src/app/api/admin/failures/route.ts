// Failures inbox — replaces the previous fire-and-forget silence around
// kill_events and Discord webhook errors. GET returns unresolved failures
// (cap 50); POST { ids: string[] } marks them resolved.
//
// Phase 2 TODO: restrict to platform_admin role once roles ship. For now the
// route requires a team scope so unauth callers are rejected, but any signed-in
// teammate can see/resolve the cross-team failure list.

import { NextResponse } from 'next/server'
import { requireTeamScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'

export async function GET() {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const { count } = await scope.supabase
    .from('ingest_failures')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)

  const { data, error } = await scope.supabase
    .from('ingest_failures')
    .select('id, match_id, match_id_helldock, henrik_id, source, error, payload, occurred_at')
    .is('resolved_at', null)
    .order('occurred_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    count: count ?? 0,
    failures: data ?? [],
  })
}

export async function POST(req: Request) {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const body = (await req.json()) as { ids?: string[] }
  const ids = Array.from(new Set((body.ids ?? []).filter(Boolean)))
  if (ids.length === 0) return NextResponse.json({ resolved: 0 })

  const { error } = await scope.supabase
    .from('ingest_failures')
    .update({ resolved_at: new Date().toISOString() })
    .in('id', ids)
    .is('resolved_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logMutation({
    userId: scope.userId,
    teamId: scope.teamId,
    action: 'update',
    table: 'ingest_failures',
    rowId: ids.join(','),
    changes: { resolved_at: 'now()', count: ids.length },
  })

  return NextResponse.json({ resolved: ids.length })
}
