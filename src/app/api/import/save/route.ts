import { createClient } from '@/lib/supabase/server'
import { ingestMatch } from '@/lib/henrik/ingest'
import { baseUrlFromRequest } from '@/lib/discord'
import { NextResponse } from 'next/server'
import type { MatchPreview } from '../fetch/route'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamSlug, selectedMatches }: { teamSlug: string; selectedMatches: MatchPreview[] } =
    await req.json()

  if (!teamSlug || !Array.isArray(selectedMatches)) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // Sort oldest-first so helldock IDs are assigned chronologically (M001, M002, ...)
  const sorted = [...selectedMatches].sort((a, b) => a.date.localeCompare(b.date))

  const baseUrl = baseUrlFromRequest(req)
  const results: {
    henrik_id: string
    match_id: string
    status: 'saved' | 'duplicate' | 'error'
    error?: string
  }[] = []

  for (const preview of sorted) {
    const result = await ingestMatch({
      henrikId: preview.henrik_id,
      teamSlug,
      rawMatch: preview.raw_match,
      source: 'manual_import',
      supabase,
      baseUrl,
    })

    if (result.status === 'ingested') {
      results.push({ henrik_id: preview.henrik_id, match_id: result.helldockId, status: 'saved' })
    } else if (result.status === 'duplicate') {
      results.push({ henrik_id: preview.henrik_id, match_id: result.helldockId, status: 'duplicate' })
    } else {
      results.push({ henrik_id: preview.henrik_id, match_id: '', status: 'error', error: result.error })
    }
  }

  const saved = results.filter((r) => r.status === 'saved').length
  const duplicates = results.filter((r) => r.status === 'duplicate').length
  const errors = results.filter((r) => r.status === 'error')

  return NextResponse.json({ saved, duplicates, errors, results })
}
