import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { suspendOrgAction, unsuspendOrgAction } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = { ok?: string; error?: string }

type Org = {
  id: string
  slug: string
  name: string
  plan: string
  suspended_at: string | null
  suspended_reason: string | null
  created_at: string
}

export default async function AdminOrgDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: SearchParams
}) {
  const admin = createAdminClient()

  const { data: orgRow } = await admin
    .from('orgs')
    .select('id, slug, name, plan, suspended_at, suspended_reason, created_at')
    .eq('id', params.id)
    .single()
  if (!orgRow) notFound()
  const org = orgRow as Org

  const [{ data: orgMembers }, { data: teams }] = await Promise.all([
    admin
      .from('org_members')
      .select('user_id, role, created_at')
      .eq('org_id', params.id),
    admin
      .from('teams')
      .select('id, slug, name, players(id)')
      .eq('org_id', params.id),
  ])

  // Resolve user emails via auth.users
  const memberUserIds = (orgMembers ?? []).map((m) => m.user_id)
  const { data: users } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', memberUserIds.length > 0 ? memberUserIds : ['00000000-0000-0000-0000-000000000000'])
  const emailById = new Map((users ?? []).map((u) => [u.id, u.email]))

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <Link href="/admin/orgs" className="text-2xs text-muted hover:text-gold uppercase tracking-wider">
          ← all orgs
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold text-fg">{org.name}</h1>
          <p className="text-muted text-sm font-mono">
            {org.slug} · plan: {org.plan}
          </p>
        </div>
        {org.suspended_at ? (
          <span className="text-2xs uppercase tracking-wider px-3 py-1 rounded border text-crimson border-crimson/40">
            suspended
          </span>
        ) : (
          <span className="text-2xs uppercase tracking-wider px-3 py-1 rounded border text-win-green border-win-green/40">
            active
          </span>
        )}
      </div>

      <Banner sp={searchParams} />

      {/* Suspension control */}
      <div className="rounded-xl border border-line bg-surface-2 p-5 mb-8">
        <h2 className="text-sm font-bold text-fg mb-2">
          {org.suspended_at ? 'Unsuspend org' : 'Suspend org'}
        </h2>
        <p className="text-muted text-xs mb-4">
          {org.suspended_at ? (
            <>
              Suspended since {new Date(org.suspended_at).toLocaleDateString()}
              {org.suspended_reason ? ` · "${org.suspended_reason}"` : ''}. Unsuspending restores access for all members.
            </>
          ) : (
            'Locks all members out of /app/*. Use for abuse or non-payment.'
          )}
        </p>
        {org.suspended_at ? (
          <form action={unsuspendOrgAction}>
            <input type="hidden" name="id" value={org.id} />
            <button
              type="submit"
              className="bg-win-green text-bg font-semibold px-4 py-1.5 rounded-md text-sm hover:opacity-90 transition-opacity"
            >
              unsuspend
            </button>
          </form>
        ) : (
          <form action={suspendOrgAction} className="flex gap-2 items-start">
            <input type="hidden" name="id" value={org.id} />
            <input
              name="reason"
              type="text"
              placeholder="reason (optional)"
              className="flex-1 bg-bg border border-line rounded-md px-3 py-1.5 text-sm text-fg placeholder-muted-2 focus:outline-none focus:border-crimson"
            />
            <button
              type="submit"
              className="border border-crimson/50 text-crimson font-semibold px-4 py-1.5 rounded-md text-sm hover:bg-crimson hover:text-bg transition-colors"
            >
              suspend
            </button>
          </form>
        )}
      </div>

      {/* Org members */}
      <Section title={`Org members · ${(orgMembers ?? []).length}`}>
        {(orgMembers ?? []).length === 0 ? (
          <EmptyState text="No org-level members." />
        ) : (
          <Table headers={['Email', 'Role', 'Joined']}>
            {(orgMembers ?? []).map((m) => (
              <tr key={m.user_id} className="border-t border-line/40">
                <td className="px-4 py-2 text-fg">{emailById.get(m.user_id) ?? '(unknown)'}</td>
                <td className="px-4 py-2"><RoleChip role={m.role} /></td>
                <td className="px-4 py-2 text-right text-muted-2 text-xs tnum">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Teams */}
      <Section title={`Teams · ${(teams ?? []).length}`}>
        {(teams ?? []).length === 0 ? (
          <EmptyState text="No teams in this org yet." />
        ) : (
          <Table headers={['Team', 'Slug', 'Roster size']}>
            {(teams ?? []).map((t) => {
              const playersArr = (t.players as unknown as { id: string }[] | null) ?? []
              return (
                <tr key={t.id} className="border-t border-line/40">
                  <td className="px-4 py-2 text-fg">{t.name}</td>
                  <td className="px-4 py-2 text-muted font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-2 text-right tnum">{playersArr.length}</td>
                </tr>
              )
            })}
          </Table>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-2xs uppercase tracking-[0.2em] text-muted-2 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-4 py-2 ${i === headers.length - 1 ? 'text-right' : 'text-left'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line/60 bg-surface-2/30 p-6 text-center text-muted text-sm">
      {text}
    </div>
  )
}

function RoleChip({ role }: { role: string }) {
  const color =
    role === 'org_owner' ? 'text-gold border-gold/40'
    : role === 'org_admin' ? 'text-gold border-gold/30'
    : 'text-muted border-line/40'
  return (
    <span className={`inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
      {role}
    </span>
  )
}

function Banner({ sp }: { sp: SearchParams }) {
  if (sp.ok === 'suspended') {
    return (
      <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-2 text-crimson text-sm mb-6">
        Org suspended. Members will see a suspension gate on next page load.
      </div>
    )
  }
  if (sp.ok === 'unsuspended') {
    return (
      <div className="rounded-lg border border-win-green/30 bg-win-green/10 px-4 py-2 text-win-green text-sm mb-6">
        Org unsuspended. Members regained access.
      </div>
    )
  }
  if (sp.error) {
    return (
      <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-2 text-crimson text-sm mb-6">
        {sp.error}
      </div>
    )
  }
  return null
}
