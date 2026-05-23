import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type OrgRow = {
  id: string
  slug: string
  name: string
  plan: string
  suspended_at: string | null
  created_at: string
  teams: { id: string }[]
  org_members: { user_id: string }[]
}

export default async function AdminOrgsPage() {
  const admin = createAdminClient()
  const { data } = await admin
    .from('orgs')
    .select('id, slug, name, plan, suspended_at, created_at, teams(id), org_members(user_id)')
    .order('created_at', { ascending: false })

  const orgs = (data ?? []) as OrgRow[]

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-3xl font-bold text-fg mb-1">Orgs</h1>
      <p className="text-muted text-sm mb-6">
        {orgs.length} total · {orgs.filter((o) => !o.suspended_at).length} active
      </p>

      {orgs.length === 0 ? (
        <p className="text-muted">No orgs yet.</p>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
              <tr>
                <th className="text-left px-4 py-2">Org</th>
                <th className="text-left px-4 py-2">Slug</th>
                <th className="text-left px-4 py-2">Plan</th>
                <th className="text-right px-4 py-2 tnum">Teams</th>
                <th className="text-right px-4 py-2 tnum">Members</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2 tnum">Created</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id} className="border-t border-line/40 hover:bg-surface-3 transition-colors">
                  <td className="px-4 py-2">
                    <Link href={`/admin/orgs/${o.id}`} className="text-gold font-medium hover:underline">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted font-mono text-xs">{o.slug}</td>
                  <td className="px-4 py-2 text-muted text-xs">{o.plan}</td>
                  <td className="px-4 py-2 text-right tnum">{o.teams.length}</td>
                  <td className="px-4 py-2 text-right tnum">{o.org_members.length}</td>
                  <td className="px-4 py-2">
                    {o.suspended_at ? (
                      <span className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border text-crimson border-crimson/40">
                        suspended
                      </span>
                    ) : (
                      <span className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border text-win-green border-win-green/40">
                        active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-muted-2 text-xs tnum">
                    {new Date(o.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
