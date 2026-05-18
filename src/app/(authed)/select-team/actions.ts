'use server'

import { redirect } from 'next/navigation'
import { setSelectedTeamSlug } from '@/lib/team-session'

export async function selectTeamAction(formData: FormData) {
  const slug = String(formData.get('slug') ?? '').trim()
  if (!slug) return
  setSelectedTeamSlug(slug)
  redirect('/')
}
