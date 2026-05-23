'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/resend'

export async function signupAction(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const orgName = String(formData.get('org_name') ?? '').trim()
  const whyExcited = String(formData.get('why_excited') ?? '').trim() || null
  const currentWorkflow = String(formData.get('current_workflow') ?? '').trim() || null

  if (!email || !orgName) {
    redirect('/signup?error=missing')
  }

  const admin = createAdminClient()
  const { error } = await admin.from('waitlist').insert({
    email,
    org_name: orgName,
    why_excited: whyExcited,
    current_workflow: currentWorkflow,
  })

  if (error) {
    console.warn('[signup] waitlist insert failed:', error.message)
    redirect('/signup?error=db')
  }

  // Notify the platform owner. Best-effort — failure doesn't block signup.
  const ownerEmail = process.env.WAITLIST_NOTIFY_EMAIL ?? 'jamesjoy696@gmail.com'
  await sendEmail({
    to: ownerEmail,
    subject: `[Helldock] New waitlist signup: ${orgName}`,
    text: [
      `New waitlist signup on Helldock:`,
      ``,
      `Email: ${email}`,
      `Org: ${orgName}`,
      whyExcited ? `Why: ${whyExcited}` : '',
      currentWorkflow ? `Today: ${currentWorkflow}` : '',
      ``,
      `Approve at: https://helldock-app.vercel.app/admin/waitlist`,
    ].filter(Boolean).join('\n'),
  })

  redirect('/signup?ok=1')
}
