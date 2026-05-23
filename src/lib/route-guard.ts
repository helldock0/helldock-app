import { NextResponse } from 'next/server'
import { createClient } from './supabase/server'
import { getSelectedTeamSlug } from './team-session'

export type TeamScope = {
  teamId: string
  teamSlug: string
  userId: string
  supabase: ReturnType<typeof createClient>
}

/**
 * Resolve { teamId, userId, supabase } for an authed mutation route. Returns
 * a NextResponse (401/400/404) when the request lacks a session, lacks a team
 * cookie, or names a team that doesn't exist. Caller short-circuits by
 * returning that response.
 */
export async function requireTeamScope(): Promise<TeamScope | NextResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = getSelectedTeamSlug()
  if (!slug) return NextResponse.json({ error: 'No team selected' }, { status: 400 })

  const { data: team } = await supabase
    .from('teams')
    .select('id, slug')
    .eq('slug', slug)
    .single()
  if (!team) return NextResponse.json({ error: 'Team not found' }, { status: 404 })

  return { teamId: team.id, teamSlug: team.slug, userId: user.id, supabase }
}

/** Drop forbidden keys before passing a body into a Supabase update. */
export function stripFields(
  body: Record<string, unknown>,
  forbid: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (!forbid.includes(key)) out[key] = body[key]
  }
  return out
}
