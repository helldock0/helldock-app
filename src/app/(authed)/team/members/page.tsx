import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSelectedTeam } from '@/lib/team-session'
import { getCurrentUserContext } from '@/lib/authz'
import { inviteTeamMemberAction } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = { invited?: string; error?: string }

type MemberRow = {
  user_id: string
  email: string
  role: string
  player_name: string | null
  joined_at: string
}

export default async function TeamMembersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  const { teamId, teamName } = await requireSelectedTeam()

  const isOrgAdmin = ctx.isPlatformAdmin
    || ctx.memberships.some((o) =>
      o.teams.some((t) => t.teamId === teamId)
      && (o.orgRole === 'org_owner' || o.orgRole === 'org_admin')
    )

  const admin = createAdminClient()
  // Fetch team members joined with auth.users for email + players for display name
  const { data: tmRows } = await admin
    .from('team_members')
    .select('user_id, role, joined_at, player_id, players(display_name)')
    .eq('team_id', teamId)

  // auth.users isn't a foreign table in PostgREST. Hit it separately by user_id.
  const userIds = (tmRows ?? []).map((r) => r.user_id)
  const { data: users } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])

  const emailById = new Map((users ?? []).map((u) => [u.id, u.email]))

  const members: MemberRow[] = (tmRows ?? []).map((r) => ({
    user_id: r.user_id,
    email: emailById.get(r.user_id) ?? '(unknown)',
    role: r.role,
    player_name:
      (r.players as unknown as { display_name?: string } | null)?.display_name ?? null,
    joined_at: r.joined_at,
  }))

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold text-fg mb-2">Team members</h1>
      <p className="text-muted text-sm mb-8">
        Members of <span className="text-gold">{teamName}</span>
        {!isOrgAdmin && <span className="ml-2 text-2xs">(read-only)</span>}
      </p>

      <Banner searchParams={searchParams} />

      <div className="rounded-2xl border border-line-strong/40 bg-surface-2 overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
            <tr>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Role</th>
              <th className="text-left px-4 py-2">Linked player</th>
              <th className="text-right px-4 py-2 tnum">Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  No members on this team yet.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.user_id} className="border-t border-line/40">
                  <td className="px-4 py-2 text-fg">{m.email}</td>
                  <td className="px-4 py-2">
                    <RoleChip role={m.role} />
                  </td>
                  <td className="px-4 py-2 text-muted">{m.player_name ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-muted-2 text-xs tnum">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isOrgAdmin && (
        <div className="rounded-2xl border border-line-strong/40 bg-surface-2 p-6">
          <h2 className="text-lg font-bold text-fg mb-2">Invite a team member</h2>
          <p className="text-muted text-sm mb-4">
            They&rsquo;ll get an email with a magic-link sign-in flow.
          </p>
          <form action={inviteTeamMemberAction} className="flex flex-col sm:flex-row gap-3">
            <input
              name="email"
              type="email"
              required
              placeholder="player@example.com"
              className="flex-1 bg-bg border border-line rounded-lg px-3 py-2 text-fg placeholder-muted-2 focus:outline-none focus:border-gold transition-colors text-sm"
            />
            <select
              name="role"
              defaultValue="player"
              className="bg-bg border border-line rounded-lg px-3 py-2 text-fg focus:outline-none focus:border-gold transition-colors text-sm"
            >
              <option value="coach">coach (edit)</option>
              <option value="player">player (read)</option>
              <option value="viewer">viewer (read)</option>
            </select>
            <button
              type="submit"
              className="bg-gold text-bg font-semibold rounded-lg px-4 py-2 hover:bg-gold-hover transition-colors text-sm"
            >
              send invite
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function Banner({ searchParams }: { searchParams: SearchParams }) {
  if (searchParams.invited === '1') {
    return (
      <div className="rounded-lg border border-win-green/30 bg-win-green/10 px-4 py-2 text-win-green text-sm mb-6">
        Invite sent.
      </div>
    )
  }
  if (searchParams.error) {
    const msg =
      searchParams.error === 'forbidden' ? "you don't have permission to invite members"
      : searchParams.error === 'email' ? 'valid email required'
      : searchParams.error === 'role' ? 'invalid role'
      : 'something went wrong'
    return (
      <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-2 text-crimson text-sm mb-6">
        {msg}
      </div>
    )
  }
  return null
}

function RoleChip({ role }: { role: string }) {
  const color =
    role === 'coach' ? 'text-gold border-gold/40'
    : role === 'player' ? 'text-fg border-line-strong/40'
    : 'text-muted border-line/40'
  return (
    <span className={`inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
      {role}
    </span>
  )
}
