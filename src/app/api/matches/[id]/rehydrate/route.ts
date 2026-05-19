import { createClient } from '@/lib/supabase/server'
import { rehydrateMatch } from '@/lib/henrik/rehydrate'
import { NextResponse } from 'next/server'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await rehydrateMatch(supabase, params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // Strip the discriminator from the response so existing clients see the same shape.
  const { ok: _ok, ...payload } = result
  return NextResponse.json(payload)
}
