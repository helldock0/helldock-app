// Failures inbox — replaces the previous fire-and-forget silence around
// kill_events and Discord webhook errors. GET returns unresolved failures
// (cap 50); POST { ids: string[] } marks them resolved.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count } = await supabase
    .from('ingest_failures')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)

  const { data, error } = await supabase
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
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { ids?: string[] }
  const ids = Array.from(new Set((body.ids ?? []).filter(Boolean)))
  if (ids.length === 0) return NextResponse.json({ resolved: 0 })

  const { error } = await supabase
    .from('ingest_failures')
    .update({ resolved_at: new Date().toISOString() })
    .in('id', ids)
    .is('resolved_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resolved: ids.length })
}
