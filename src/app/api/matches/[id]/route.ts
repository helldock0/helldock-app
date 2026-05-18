import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updates = await req.json()

  // Auto-derive result if scores are being updated
  if (updates.our_score !== undefined && updates.opp_score !== undefined) {
    updates.result = updates.our_score > updates.opp_score ? 'W'
      : updates.our_score < updates.opp_score ? 'L'
      : null
  }

  const { data, error } = await supabase
    .from('matches')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
