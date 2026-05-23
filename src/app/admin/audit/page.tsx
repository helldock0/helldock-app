import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type SearchParams = {
  table?: string
  action?: string
  page?: string
}

const PAGE_SIZE = 50

export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = createAdminClient()

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  let q = admin
    .from('audit_log')
    .select('id, user_id, team_id, action, table_name, row_id, changes, at', { count: 'exact' })
    .order('at', { ascending: false })

  if (searchParams.table) q = q.eq('table_name', searchParams.table)
  if (searchParams.action) q = q.eq('action', searchParams.action)

  const { data, count } = await q.range(offset, offset + PAGE_SIZE - 1)

  const rows = data ?? []

  // Resolve user emails via admin_users_by_ids RPC (PostgREST blocks auth schema)
  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]))
  const { data: users } = await admin.rpc('admin_users_by_ids', {
    user_ids: userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'],
  })
  const emailById = new Map(
    ((users as { id: string; email: string }[] | null) ?? []).map((u) => [u.id, u.email])
  )

  // Resolve team names
  const teamIds = Array.from(new Set(rows.map((r) => r.team_id).filter(Boolean) as string[]))
  const { data: teamsData } = await admin
    .from('teams')
    .select('id, slug')
    .in('id', teamIds.length > 0 ? teamIds : ['00000000-0000-0000-0000-000000000000'])
  const teamSlugById = new Map((teamsData ?? []).map((t) => [t.id, t.slug]))

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="p-8 max-w-7xl">
      <h1 className="text-3xl font-bold text-fg mb-1">Audit log</h1>
      <p className="text-muted text-sm mb-6">
        {total} total events · page {page} of {totalPages}
      </p>

      <Filters searchParams={searchParams} />

      {rows.length === 0 ? (
        <p className="text-muted">No events match these filters.</p>
      ) : (
        <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">User</th>
                <th className="text-left px-3 py-2">Team</th>
                <th className="text-left px-3 py-2">Action</th>
                <th className="text-left px-3 py-2">Table</th>
                <th className="text-left px-3 py-2">Row</th>
                <th className="text-left px-3 py-2">Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line/40 font-mono text-xs">
                  <td className="px-3 py-2 text-muted-2 whitespace-nowrap tnum">
                    {new Date(r.at).toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-3 py-2 text-fg">{r.user_id ? emailById.get(r.user_id) ?? '(unknown)' : '—'}</td>
                  <td className="px-3 py-2 text-muted">{r.team_id ? teamSlugById.get(r.team_id) ?? '?' : '—'}</td>
                  <td className="px-3 py-2 text-gold">{r.action}</td>
                  <td className="px-3 py-2 text-fg">{r.table_name}</td>
                  <td className="px-3 py-2 text-muted-2 text-2xs">{shortId(r.row_id)}</td>
                  <td className="px-3 py-2 text-muted-2 text-2xs max-w-xs truncate" title={JSON.stringify(r.changes)}>
                    {r.changes ? JSON.stringify(r.changes).slice(0, 80) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} searchParams={searchParams} />
    </div>
  )
}

function Filters({ searchParams }: { searchParams: SearchParams }) {
  return (
    <form className="flex gap-2 items-end mb-6">
      <div>
        <label className="block text-2xs uppercase text-muted-2 mb-1">Table</label>
        <input
          name="table"
          type="text"
          defaultValue={searchParams.table ?? ''}
          placeholder="matches"
          className="bg-bg border border-line rounded-md px-2 py-1 text-sm text-fg w-32 focus:outline-none focus:border-gold"
        />
      </div>
      <div>
        <label className="block text-2xs uppercase text-muted-2 mb-1">Action</label>
        <select
          name="action"
          defaultValue={searchParams.action ?? ''}
          className="bg-bg border border-line rounded-md px-2 py-1 text-sm text-fg focus:outline-none focus:border-gold"
        >
          <option value="">any</option>
          <option value="insert">insert</option>
          <option value="update">update</option>
          <option value="delete">delete</option>
        </select>
      </div>
      <button
        type="submit"
        className="border border-line text-fg px-3 py-1 rounded-md text-sm hover:border-gold hover:text-gold transition-colors"
      >
        filter
      </button>
      {(searchParams.table || searchParams.action) && (
        <Link
          href="/admin/audit"
          className="text-2xs text-muted hover:text-gold uppercase tracking-wider ml-2"
        >
          clear
        </Link>
      )}
    </form>
  )
}

function Pagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number
  totalPages: number
  searchParams: SearchParams
}) {
  if (totalPages <= 1) return null
  const base = new URLSearchParams()
  if (searchParams.table) base.set('table', searchParams.table)
  if (searchParams.action) base.set('action', searchParams.action)
  const prevHref = `/admin/audit?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page - 1) })}`
  const nextHref = `/admin/audit?${new URLSearchParams({ ...Object.fromEntries(base), page: String(page + 1) })}`
  return (
    <div className="flex items-center justify-center gap-3 mt-6 text-sm">
      {page > 1 ? (
        <Link href={prevHref} className="text-muted hover:text-gold">← prev</Link>
      ) : (
        <span className="text-muted-2">← prev</span>
      )}
      <span className="text-muted-2 tnum">{page} / {totalPages}</span>
      {page < totalPages ? (
        <Link href={nextHref} className="text-muted hover:text-gold">next →</Link>
      ) : (
        <span className="text-muted-2">next →</span>
      )}
    </div>
  )
}

function shortId(s: string | null): string {
  if (!s) return '—'
  return s.length > 8 ? s.slice(0, 8) + '…' : s
}
