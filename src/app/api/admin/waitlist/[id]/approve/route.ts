import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUserContext } from '@/lib/authz'
import { generateInviteToken } from '@/lib/invites/token'
import { sendEmail } from '@/lib/email/resend'
import { logMutation } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const INVITE_TTL_DAYS = 14

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ctx.isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()

  // Load the waitlist entry
  const { data: entry, error: entryErr } = await admin
    .from('waitlist')
    .select('id, email, org_name, status')
    .eq('id', params.id)
    .single()
  if (entryErr || !entry) {
    return NextResponse.json({ error: 'waitlist entry not found' }, { status: 404 })
  }
  if (entry.status === 'approved') {
    return NextResponse.json({ error: 'already approved' }, { status: 409 })
  }

  // Generate invite (org-creation flavor — org_id NULL, accepter creates their org)
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
  if (inviteErr || !invite) {
    return NextResponse.json({ error: inviteErr?.message ?? 'invite create failed' }, { status: 500 })
  }

  // Mark waitlist approved
  const { error: updErr } = await admin
    .from('waitlist')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by_user_id: ctx.userId,
    })
    .eq('id', params.id)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Send the invite email
  const inviteUrl = `https://helldock-app.vercel.app/invite/${plaintext}`
  const emailResult = await sendEmail({
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
    teamId: '00000000-0000-0000-0000-000000000000', // platform-level action, no team scope
    action: 'update',
    table: 'waitlist',
    rowId: params.id,
    changes: { status: 'approved', invite_id: invite.id },
  })

  return NextResponse.json({
    ok: true,
    invite_id: invite.id,
    invite_url: inviteUrl,
    email_sent: emailResult.ok,
    email_error: emailResult.error,
  })
}
