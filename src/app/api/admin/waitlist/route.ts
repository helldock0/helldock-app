import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserContext } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Use admin client to bypass RLS (we already gated on platform_admin above)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('waitlist')
    .select('id, email, org_name, why_excited, current_workflow, status, approved_at, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}
