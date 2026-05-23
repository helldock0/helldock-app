'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hashInviteToken } from '@/lib/invites/token'

function origin(): string {
  const h = headers()
  return process.env.NEXT_PUBLIC_APP_URL ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? 'helldock-app.vercel.app'}`
}

/** Send a magic link constrained to the invite's email. */
export async function sendInviteMagicLinkAction(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!token || !email) redirect(`/invite/${token}?error=missing`)

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin()}/invite/${token}` },
  })
  if (error) {
    console.warn('[invite] signInWithOtp failed:', error.message)
    redirect(`/invite/${token}?error=otp`)
  }
  redirect(`/invite/${token}?sent=1`)
}

/**
 * Accept the invite as the currently-signed-in user. Creates the appropriate
 * membership row (org or team) and marks the invite consumed. For org-creation
 * invites (org_id NULL), redirects to /onboarding so the user can set up
 * their first org. For team/org invites, redirects to /select-team.
 */
export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  if (!token) redirect('/login')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const hash = hashInviteToken(token)
  const { data: invite } = await admin
    .from('invites')
    .select('id, email, org_id, team_id, intended_role, expires_at, accepted_at')
    .eq('token_hash', hash)
    .maybeSingle()

  if (!invite) redirect(`/invite/${token}?error=notfound`)
  if (invite.accepted_at) redirect('/select-team')
  if (new Date(invite.expires_at) < new Date()) {
    redirect(`/invite/${token}?error=expired`)
  }
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    redirect(`/invite/${token}?error=wrongemail`)
  }

  // Existing-org invite: create the membership row.
  if (invite.org_id) {
    if (invite.team_id) {
      const { error } = await admin.from('team_members').upsert({
        team_id: invite.team_id,
        user_id: user.id,
        role: invite.intended_role,
      }, { onConflict: 'team_id,user_id' })
      if (error) console.warn('[invite] team_members upsert failed:', error.message)
    } else {
      const { error } = await admin.from('org_members').upsert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.intended_role,
      }, { onConflict: 'org_id,user_id' })
      if (error) console.warn('[invite] org_members upsert failed:', error.message)
    }
  }
  // Org-creation invite: nothing to insert yet — onboarding wizard creates the org.

  await admin
    .from('invites')
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: user.id,
    })
    .eq('id', invite.id)

  if (invite.org_id === null) {
    redirect('/onboarding')
  }
  redirect('/select-team')
}
