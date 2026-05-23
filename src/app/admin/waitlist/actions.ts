'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserContext } from '@/lib/authz'
import { generateInviteToken } from '@/lib/invites/token'
import { sendEmail } from '@/lib/email/resend'
import { logMutation } from '@/lib/audit'

const INVITE_TTL_DAYS = 14
const PLATFORM_TEAM_PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

export async function approveWaitlistAction(formData: FormData) {
  const ctx = await getCurrentUserContext()
  if (!ctx || !ctx.isPlatformAdmin) redirect('/admin/waitlist?error=forbidden')

  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/waitlist?error=missing')

  const admin = createAdminClient()

  const { data: entry } = await admin
    .from('waitlist')
    .select('id, email, org_name, status')
    .eq('id', id)
    .single()
  if (!entry) redirect('/admin/waitlist?error=notfound')
  if (entry.status === 'approved') redirect('/admin/waitlist?error=already')

  const { plaintext, hash } = generateInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error: inviteErr } = await admin
    .from('invites')
    .insert({
      token_hash: hash,
      email: entry.email,
      org_id: null,
      team_id: null,
      intended_role: 'org_owner',
      expires_at: expiresAt,
      invited_by_user_id: ctx.userId,
    })
    .select('id')
    .single()
  if (inviteErr || !invite) redirect('/admin/waitlist?error=invite_db')

  await admin
    .from('waitlist')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by_user_id: ctx.userId,
    })
    .eq('id', id)

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helldock-app.vercel.app'
  const inviteUrl = `${origin}/invite/${plaintext}`
  await sendEmail({
    to: entry.email,
    subject: `[Helldock] You're in — set up ${entry.org_name}`,
    text: [
      `You're approved for Helldock alpha.`,
      ``,
      `Click here to create your org and get started:`,
      inviteUrl,
      ``,
      `This invite expires in ${INVITE_TTL_DAYS} days.`,
      ``,
      `— Helldock`,
    ].join('\n'),
  })

  logMutation({
    userId: ctx.userId,
    teamId: PLATFORM_TEAM_PLACEHOLDER,
    action: 'update',
    table: 'waitlist',
    rowId: id,
    changes: { status: 'approved' },
  })

  revalidatePath('/admin/waitlist')
  redirect(`/admin/waitlist?ok=approved&email=${encodeURIComponent(entry.email)}`)
}

export async function rejectWaitlistAction(formData: FormData) {
  const ctx = await getCurrentUserContext()
  if (!ctx || !ctx.isPlatformAdmin) redirect('/admin/waitlist?error=forbidden')

  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/admin/waitlist?error=missing')

  const admin = createAdminClient()
  await admin
    .from('waitlist')
    .update({ status: 'rejected', approved_by_user_id: ctx.userId })
    .eq('id', id)

  logMutation({
    userId: ctx.userId,
    teamId: PLATFORM_TEAM_PLACEHOLDER,
    action: 'update',
    table: 'waitlist',
    rowId: id,
    changes: { status: 'rejected' },
  })

  revalidatePath('/admin/waitlist')
  redirect('/admin/waitlist?ok=rejected')
}
