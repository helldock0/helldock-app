'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSelectedTeam } from '@/lib/team-session'
import { getCurrentUserContext } from '@/lib/authz'
import { generateInviteToken } from '@/lib/invites/token'
import { sendEmail } from '@/lib/email/resend'

const INVITE_TTL_DAYS = 14
const ALLOWED_TEAM_ROLES = ['coach', 'analyst', 'player', 'viewer'] as const

export async function inviteTeamMemberAction(formData: FormData) {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  const { teamId, teamSlug } = await requireSelectedTeam()

  // Verify org_admin+ for this team
  const isOrgAdmin = ctx.isPlatformAdmin
    || ctx.memberships.some((o) =>
      o.teams.some((t) => t.teamId === teamId)
      && (o.orgRole === 'org_owner' || o.orgRole === 'org_admin')
    )
  if (!isOrgAdmin) redirect(`/app/team/members?error=forbidden`)

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? '').trim() as (typeof ALLOWED_TEAM_ROLES)[number]
  if (!email) redirect('/app/team/members?error=email')
  if (!ALLOWED_TEAM_ROLES.includes(role)) redirect('/app/team/members?error=role')

  // Find the org_id (so the invite carries it)
  const orgId = ctx.memberships
    .find((o) => o.teams.some((t) => t.teamId === teamId))?.orgId ?? null

  const admin = createAdminClient()
  const { plaintext, hash } = generateInviteToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('invites').insert({
    token_hash: hash,
    email,
    org_id: orgId,
    team_id: teamId,
    intended_role: role,
    expires_at: expiresAt,
    invited_by_user_id: ctx.userId,
  })
  if (error) {
    console.warn('[invite member] insert failed:', error.message)
    redirect(`/app/team/members?error=db`)
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'https://helldock-app.vercel.app'
  const inviteUrl = `${origin}/invite/${plaintext}`
  await sendEmail({
    to: email,
    subject: `[Helldock] You're invited to ${teamSlug} as ${role}`,
    text: [
      `You've been invited to join the ${teamSlug} team on Helldock as ${role}.`,
      ``,
      `Accept the invite here:`,
      inviteUrl,
      ``,
      `This invite expires in ${INVITE_TTL_DAYS} days.`,
      ``,
      `— Helldock`,
    ].join('\n'),
  })

  revalidatePath('/app/team/members')
  redirect('/app/team/members?invited=1')
}
