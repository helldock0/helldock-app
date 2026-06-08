import { ingestMatch } from '@/lib/henrik/ingest'
import { requireTeamWriteScope } from '@/lib/route-guard'
import { logMutation } from '@/lib/audit'
import { NextResponse } from 'next/server'
import type { MatchPreview } from '../fetch/route'

export async function POST(req: Request) {
  const scope = await requireTeamWriteScope()
  if (scope instanceof NextResponse) return scope

  const { teamSlug, selectedMatches }: { teamSlug: string; selectedMatches: MatchPreview[] } =
    await req.json()

  if (!teamSlug || !Array.isArray(selectedMatches)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (teamSlug !== scope.teamSlug) {
    return NextResponse.json({ error: 'team mismatch' }, { status: 400 })
  }

  // Sort oldest-first so helldock IDs are assigned chronologically (M001, M002, ...)
  const sorted = [...selectedMatches].sort((a, b) => a.date.localeCompare(b.date))

  const results: {
    henrik_id: string
    match_id: string
    match_uuid?: string
    status: 'saved' | 'duplicate' | 'error'
    error?: string
  }[] = []

  for (const preview of sorted) {
    const result = await ingestMatch({
      henrikId: preview.henrik_id,
      teamSlug,
      rawMatch: preview.raw_match,
      source: 'manual_import',
      supabase: scope.supabase,
    })

    if (result.status === 'ingested') {
      results.push({
        henrik_id: preview.henrik_id,
        match_id: result.helldockId,
        match_uuid: result.matchUUID,
        status: 'saved',
      })
      logMutation({
        userId: scope.userId,
        teamId: scope.teamId,
        action: 'insert',
        table: 'matches',
        rowId: result.helldockId,
        changes: { henrik_id: preview.henrik_id, source: 'manual_import' },
      })
    } else if (result.status === 'duplicate') {
      results.push({
        henrik_id: preview.henrik_id,
        match_id: result.helldockId,
        match_uuid: result.matchUUID,
        status: 'duplicate',
      })
    } else {
      results.push({ henrik_id: preview.henrik_id, match_id: '', status: 'error', error: result.error })
    }
  }

  const saved = results.filter((r) => r.status === 'saved').length
  const duplicates = results.filter((r) => r.status === 'duplicate').length
  const errors = results.filter((r) => r.status === 'error')

  return NextResponse.json({ saved, duplicates, errors, results })
}
