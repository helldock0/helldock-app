/**
 * Transactional email via Resend. Direct REST API (no npm dep).
 * No-ops with a console warning when RESEND_API_KEY isn't set so dev can run
 * without email plumbing.
 */
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? ''
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'Helldock <onboarding@resend.dev>'

export type SendResult = { ok: boolean; id?: string; error?: string }

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    console.info('[email] no RESEND_API_KEY — would have sent:', {
      to: opts.to,
      subject: opts.subject,
      text_preview: opts.text.slice(0, 200),
    })
    return { ok: false, error: 'no_api_key' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.warn('[email] Resend rejected:', res.status, errBody)
      return { ok: false, error: errBody }
    }
    const body = (await res.json()) as { id?: string }
    return { ok: true, id: body.id }
  } catch (err) {
    console.warn('[email] fetch failed:', err)
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}
