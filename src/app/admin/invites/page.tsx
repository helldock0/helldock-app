import { createAdminClient } from '@/lib/supabase/admin'
import { revokeInviteAction } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = { ok?: string; error?: string }

type InviteRow = {
  id: string
  email: string
  org_id: string | null
  team_id: string | null
  intended_role: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export default async function AdminInvitesPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('invites')
    .select('id, email, org_id, team_id, intended_role, expires_at, accepted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const invites = (data ?? []) as InviteRow[]
  const now = new Date()
  const active = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > now)
  const accepted = invites.filter((i) => i.accepted_at)
  const expired = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) <= now)

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-3xl font-bold text-fg mb-1">Invites</h1>
      <p className="text-muted text-sm mb-6">
        {active.length} active · {accepted.length} accepted · {expired.length} expired/revoked
      </p>

      <Banner sp={searchParams} />

      <Section title={`Active · ${active.length}`}>
        {active.length === 0 ? (
          <EmptyState text="No active invites." />
        ) : (
          <InviteTable invites={active} showRevoke />
        )}
      </Section>

      <Section title={`Accepted · ${accepted.length}`}>
        {accepted.length === 0 ? (
          <EmptyState text="No accepted invites yet." />
        ) : (
          <InviteTable invites={accepted.slice(0, 50)} showRevoke={false} />
        )}
      </Section>

      <Section title={`Expired / revoked · ${expired.length}`}>
        {expired.length === 0 ? (
          <EmptyState text="No expired invites." />
        ) : (
          <InviteTable invites={expired.slice(0, 50)} showRevoke={false} />
        )}
      </Section>
    </div>
  )
}

function InviteTable({ invites, showRevoke }: { invites: InviteRow[]; showRevoke: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
          <tr>
            <th className="text-left px-4 py-2">Email</th>
            <th className="text-left px-4 py-2">Type</th>
            <th className="text-left px-4 py-2">Role</th>
            <th className="text-right px-4 py-2 tnum">Expires</th>
            {showRevoke && <th className="text-right px-4 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {invites.map((inv) => (
            <tr key={inv.id} className="border-t border-line/40">
              <td className="px-4 py-2 text-fg">{inv.email}</td>
              <td className="px-4 py-2 text-muted text-xs">
                {inv.org_id ? (inv.team_id ? 'team invite' : 'org member') : 'new org'}
              </td>
              <td className="px-4 py-2">
                <span className="inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border border-line text-muted">
                  {inv.intended_role}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-muted-2 text-xs tnum">
                {new Date(inv.expires_at).toLocaleDateString()}
              </td>
              {showRevoke && (
                <td className="px-4 py-2 text-right">
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button
                      type="submit"
                      className="text-2xs text-muted hover:text-crimson uppercase tracking-wider"
                    >
                      revoke
                    </button>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line/60 bg-surface-2/30 p-6 text-center text-muted text-sm">
      {text}
    </div>
  )
}

function Banner({ sp }: { sp: SearchParams }) {
  if (sp.ok === 'revoked') {
    return (
      <div className="rounded-lg border border-line bg-surface-3 px-4 py-2 text-muted text-sm mb-6">
        Invite revoked.
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
