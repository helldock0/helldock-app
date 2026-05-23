import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const admin = createAdminClient()

  const [orgsRes, pendingRes, usersRes, failuresRes, recentAuditRes, recentSignupsRes] = await Promise.all([
    admin.from('orgs').select('id, suspended_at'),
    admin.from('waitlist').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.schema('auth').from('users').select('id', { count: 'exact', head: true }),
    admin.from('ingest_failures').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    admin.from('audit_log').select('id, action, table_name, at').order('at', { ascending: false }).limit(5),
    admin.from('waitlist').select('email, org_name, status, created_at').order('created_at', { ascending: false }).limit(5),
  ])

  const orgs = orgsRes.data ?? []
  const activeOrgs = orgs.filter((o) => !o.suspended_at).length
  const suspendedOrgs = orgs.length - activeOrgs

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-3xl font-bold text-fg mb-1">Admin dashboard</h1>
      <p className="text-muted text-sm mb-8">Platform-wide stats and recent activity.</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <Stat label="Orgs · active" value={`${activeOrgs}`} />
        <Stat label="Orgs · suspended" value={`${suspendedOrgs}`} tone={suspendedOrgs > 0 ? 'warn' : 'default'} />
        <Stat label="Users" value={`${usersRes.count ?? 0}`} />
        <Stat label="Pending waitlist" value={`${pendingRes.count ?? 0}`} tone={(pendingRes.count ?? 0) > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card title="Recent signups" link="/admin/waitlist">
          {(recentSignupsRes.data ?? []).length === 0 ? (
            <p className="text-muted-2 text-sm">No signups yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(recentSignupsRes.data ?? []).map((s, i) => (
                <li key={i} className="flex justify-between items-baseline">
                  <span className="text-fg">{s.org_name}</span>
                  <span className="text-muted-2 text-xs">
                    {statusChip(s.status)} · {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent audit events" link="/admin/audit">
          {(recentAuditRes.data ?? []).length === 0 ? (
            <p className="text-muted-2 text-sm">No audit events yet.</p>
          ) : (
            <ul className="space-y-2 text-sm font-mono">
              {(recentAuditRes.data ?? []).map((a) => (
                <li key={a.id} className="flex justify-between items-baseline">
                  <span className="text-fg">
                    <span className="text-gold">{a.action}</span> {a.table_name}
                  </span>
                  <span className="text-muted-2 text-xs">
                    {new Date(a.at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Unresolved ingest failures" link={null}>
        <p className="text-3xl font-bold tnum">
          <span className={(failuresRes.count ?? 0) > 0 ? 'text-crimson' : 'text-fg'}>
            {failuresRes.count ?? 0}
          </span>
        </p>
        <p className="text-muted-2 text-xs mt-1">
          Scrim ingests that hit an error and need investigation.
        </p>
      </Card>
    </div>
  )
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'warn' }) {
  const valueColor = tone === 'warn' ? 'text-gold' : 'text-fg'
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="text-2xs uppercase tracking-[0.2em] text-muted-2 mb-1">{label}</div>
      <div className={`text-3xl font-bold tnum ${valueColor}`}>{value}</div>
    </div>
  )
}

function Card({ title, link, children }: { title: string; link: string | null; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xs uppercase tracking-[0.2em] text-muted-2">{title}</h2>
        {link && (
          <a href={link} className="text-2xs text-muted hover:text-gold transition-colors">
            view all →
          </a>
        )}
      </div>
      {children}
    </div>
  )
}

function statusChip(status: string): string {
  if (status === 'pending') return '⏳ pending'
  if (status === 'approved') return '✓ approved'
  if (status === 'rejected') return '✕ rejected'
  return status
}
