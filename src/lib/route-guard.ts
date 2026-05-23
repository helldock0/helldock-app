import { NextResponse } from 'next/server'
import { createClient } from './supabase/server'
import { getSelectedTeamSlug } from './team-session'
import { getCurrentUserContext, canWriteTeam } from './authz'

export type TeamScope = {
  teamId: string
  teamSlug: string
  userId: string
  supabase: ReturnType<typeof createClient>
}

/**
 * Resolve { teamId, userId, supabase } for an authed read or mutation route.
 * Returns a NextResponse (401/400/404) when the request lacks a session,
 * lacks a team cookie, or names a team the user isn't a member of. Platform
 * admins can scope to any team. Does NOT check write role — use
 * `requireTeamWriteScope` for mutations.
 */
export async function requireTeamScope(): Promise<TeamScope | NextResponse> {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slug = getSelectedTeamSlug()
  if (!slug) return NextResponse.json({ error: 'No team selected' }, { status: 400 })

  const supabase = createClient()

  for (const org of ctx.memberships) {
    const team = org.teams.find((t) => t.teamSlug === slug)
    if (team) {
      return { teamId: team.teamId, teamSlug: team.teamSlug, userId: ctx.userId, supabase }
    }
  }

  if (ctx.isPlatformAdmin) {
    const { data: team } = await supabase
      .from('teams')
      .select('id, slug')
      .eq('slug', slug)
      .single()
    if (team) {
      return { teamId: team.id, teamSlug: team.slug, userId: ctx.userId, supabase }
    }
  }

  return NextResponse.json({ error: 'Team not found' }, { status: 404 })
}

/**
 * Like `requireTeamScope` but additionally enforces write privilege (coach,
 * org_admin, org_owner, or platform_admin). Players/viewers get 403.
 */
export async function requireTeamWriteScope(): Promise<TeamScope | NextResponse> {
  const scope = await requireTeamScope()
  if (scope instanceof NextResponse) return scope

  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!canWriteTeam(ctx, scope.teamId)) {
    return NextResponse.json(
      { error: 'Forbidden — coach role or higher required' },
      { status: 403 }
    )
  }
  return scope
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
