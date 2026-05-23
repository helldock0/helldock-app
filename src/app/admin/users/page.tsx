import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type SearchParams = { q?: string }

type UserRow = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
}

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = createAdminClient()
  const q = (searchParams.q ?? '').trim()

  // auth.users isn't exposed via PostgREST. Use the public admin_users_list
  // SECURITY DEFINER fn which supports optional ILIKE search on email.
  const { data: usersData } = await admin.rpc('admin_users_list', {
    search: q.length > 0 ? q : null,
    lim: 200,
  })
  const users = (usersData ?? []) as UserRow[]

  // Resolve memberships for these users
  const userIds = users.map((u) => u.id)
  const [{ data: orgM }, { data: teamM }, { data: platformAdmins }] = await Promise.all([
    admin
      .from('org_members')
      .select('user_id, role, orgs!inner(slug, name)')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    admin
      .from('team_members')
      .select('user_id, role, teams!inner(slug, name)')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
    admin
      .from('platform_admins')
      .select('user_id')
      .in('user_id', userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000']),
  ])

  const orgMByUser = new Map<string, { role: string; orgName: string; orgSlug: string }[]>()
  for (const m of orgM ?? []) {
    const arr = orgMByUser.get(m.user_id) ?? []
    const org = m.orgs as unknown as { slug: string; name: string }
    arr.push({ role: m.role, orgName: org.name, orgSlug: org.slug })
    orgMByUser.set(m.user_id, arr)
  }
  const teamMByUser = new Map<string, { role: string; teamName: string; teamSlug: string }[]>()
  for (const m of teamM ?? []) {
    const arr = teamMByUser.get(m.user_id) ?? []
    const team = m.teams as unknown as { slug: string; name: string }
    arr.push({ role: m.role, teamName: team.name, teamSlug: team.slug })
    teamMByUser.set(m.user_id, arr)
  }
  const isPlatformAdmin = new Set((platformAdmins ?? []).map((p) => p.user_id))

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-3xl font-bold text-fg mb-1">Users</h1>
      <p className="text-muted text-sm mb-6">
        {users.length} {q ? 'matching' : 'most recent'} users
      </p>

      <form className="mb-6 flex gap-2 items-end">
        <div className="flex-1 max-w-md">
          <label className="block text-2xs uppercase tracking-wider text-muted-2 mb-1">
            Search by email
          </label>
          <input
            name="q"
            type="text"
            defaultValue={q}
            placeholder="example@gmail.com"
            className="w-full bg-bg border border-line rounded-md px-3 py-1.5 text-sm text-fg placeholder-muted-2 focus:outline-none focus:border-gold"
          />
        </div>
        <button
          type="submit"
          className="border border-line text-fg px-4 py-1.5 rounded-md text-sm hover:border-gold hover:text-gold transition-colors"
        >
          search
        </button>
      </form>

      {users.length === 0 ? (
        <p className="text-muted">No users found.</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl border border-line bg-surface-2 p-4">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0">
                  <div className="text-fg font-medium">{u.email}</div>
                  <div className="text-xs text-muted-2 font-mono">
                    {u.id} · joined {new Date(u.created_at).toLocaleDateString()}
                    {u.last_sign_in_at && (
                      <> · last signed in {new Date(u.last_sign_in_at).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                {isPlatformAdmin.has(u.id) && (
                  <span className="text-2xs uppercase tracking-wider px-2 py-0.5 rounded border text-gold border-gold/40 whitespace-nowrap">
                    platform admin
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-2xs">
                {(orgMByUser.get(u.id) ?? []).map((om, i) => (
                  <span
                    key={`om-${i}`}
                    className="border border-gold/30 rounded px-2 py-0.5 text-gold"
                  >
                    {om.orgName} · {om.role}
                  </span>
                ))}
                {(teamMByUser.get(u.id) ?? []).map((tm, i) => (
                  <span
                    key={`tm-${i}`}
                    className="border border-line text-muted rounded px-2 py-0.5"
                  >
                    {tm.teamName} · {tm.role}
                  </span>
                ))}
                {(orgMByUser.get(u.id) ?? []).length === 0 &&
                 (teamMByUser.get(u.id) ?? []).length === 0 &&
                 !isPlatformAdmin.has(u.id) && (
                  <span className="text-muted-2">no memberships yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
