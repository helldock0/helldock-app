'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserContext } from '@/lib/authz'
import { logMutation } from '@/lib/audit'

const PLATFORM_TEAM_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

export async function revokeInviteAction(formData: FormData) {
  const ctx = await getCurrentUserContext()
  if (!ctx || !ctx.isPlatformAdmin) redirect('/admin/invites?error=forbidden')

  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/invites')

  const admin = createAdminClient()
  // Revoke = set expires_at to past so the token is no longer valid.
  await admin
    .from('invites')
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', id)

  logMutation({
    userId: ctx.userId,
    teamId: PLATFORM_TEAM_PLACEHOLDER,
    action: 'update',
    table: 'invites',
    rowId: id,
    changes: { expires_at: 'now() (revoked)' },
  })

  revalidatePath('/admin/invites')
  redirect('/admin/invites?ok=revoked')
}
