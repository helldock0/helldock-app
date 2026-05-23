'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserContext } from '@/lib/authz'
import { logMutation } from '@/lib/audit'

const PLATFORM_TEAM_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

export async function suspendOrgAction(formData: FormData) {
  const ctx = await getCurrentUserContext()
  if (!ctx || !ctx.isPlatformAdmin) redirect('/admin/orgs?error=forbidden')

  const id = String(formData.get('id') ?? '')
  const reason = String(formData.get('reason') ?? '').trim() || null
  if (!id) redirect('/admin/orgs')

  const admin = createAdminClient()
  await admin
    .from('orgs')
    .update({
      suspended_at: new Date().toISOString(),
      suspended_reason: reason,
    })
    .eq('id', id)

  logMutation({
    userId: ctx.userId,
    teamId: PLATFORM_TEAM_PLACEHOLDER,
    action: 'update',
    table: 'orgs',
    rowId: id,
    changes: { suspended_at: 'now()', suspended_reason: reason },
  })

  revalidatePath(`/admin/orgs/${id}`)
  revalidatePath('/admin/orgs')
  redirect(`/admin/orgs/${id}?ok=suspended`)
}

export async function unsuspendOrgAction(formData: FormData) {
  const ctx = await getCurrentUserContext()
  if (!ctx || !ctx.isPlatformAdmin) redirect('/admin/orgs?error=forbidden')

  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/orgs')

  const admin = createAdminClient()
  await admin
    .from('orgs')
    .update({ suspended_at: null, suspended_reason: null })
    .eq('id', id)

  logMutation({
    userId: ctx.userId,
    teamId: PLATFORM_TEAM_PLACEHOLDER,
    action: 'update',
    table: 'orgs',
    rowId: id,
    changes: { suspended_at: null },
  })

  revalidatePath(`/admin/orgs/${id}`)
  revalidatePath('/admin/orgs')
  redirect(`/admin/orgs/${id}?ok=unsuspended`)
}
