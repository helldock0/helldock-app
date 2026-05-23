'use server'

import { redirect } from 'next/navigation'
import { setSelectedTeamSlug } from '@/lib/team-session'

export async function selectTeamAction(formData: FormData) {
  const slug = String(formData.get('slug') ?? '').trim()
  if (!slug) return
  setSelectedTeamSlug(slug)
  // Redirect directly to /app — going through / would let the action's
  // RSC redirect short-circuit middleware (which would have bounced authed
  // users from / to /app) and land us on the landing page instead.
  redirect('/app')
}
