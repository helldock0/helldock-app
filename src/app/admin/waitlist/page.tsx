import { createAdminClient } from '@/lib/supabase/admin'
import { approveWaitlistAction, rejectWaitlistAction } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = { ok?: string; email?: string; error?: string }

type WaitlistRow = {
  id: string
  email: string
  org_name: string
  why_excited: string | null
  current_workflow: string | null
  status: 'pending' | 'approved' | 'rejected'
  approved_at: string | null
  created_at: string
}

export default async function AdminWaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('waitlist')
    .select('id, email, org_name, why_excited, current_workflow, status, approved_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  const entries = (data ?? []) as WaitlistRow[]
  const pending = entries.filter((e) => e.status === 'pending')
  const handled = entries.filter((e) => e.status !== 'pending')

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-3xl font-bold text-fg mb-1">Waitlist</h1>
      <p className="text-muted text-sm mb-6">
        Approving sends an invite email and creates an org-creation invite token.
      </p>

      <Banner sp={searchParams} />

      <Section title={`Pending · ${pending.length}`}>
        {pending.length === 0 ? (
          <EmptyState text="No pending signups." />
        ) : (
          <div className="space-y-3">
            {pending.map((e) => (
              <PendingCard key={e.id} entry={e} />
            ))}
          </div>
        )}
      </Section>

      <Section title={`Handled · ${handled.length}`}>
        {handled.length === 0 ? (
          <EmptyState text="No handled signups yet." />
        ) : (
          <div className="rounded-xl border border-line bg-surface-2 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-3 text-2xs uppercase tracking-wider text-muted-2">
                <tr>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Org</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2 tnum">When</th>
                </tr>
              </thead>
              <tbody>
                {handled.map((e) => (
                  <tr key={e.id} className="border-t border-line/40">
                    <td className="px-4 py-2 text-fg">{e.email}</td>
                    <td className="px-4 py-2 text-muted">{e.org_name}</td>
                    <td className="px-4 py-2">
                      <StatusChip status={e.status} />
                    </td>
                    <td className="px-4 py-2 text-right text-muted-2 text-xs tnum">
                      {new Date(e.approved_at ?? e.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function PendingCard({ entry }: { entry: WaitlistRow }) {
  return (
    <div className="rounded-xl border border-line-strong/40 bg-surface-2 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <div className="font-bold text-fg text-base mb-0.5">{entry.org_name}</div>
          <div className="text-gold text-xs font-mono">{entry.email}</div>
        </div>
        <div className="text-2xs text-muted-2 tnum whitespace-nowrap">
          {new Date(entry.created_at).toLocaleDateString()}
        </div>
      </div>

      {entry.why_excited && (
        <div className="mb-2">
          <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">why excited</div>
          <p className="text-sm text-fg">{entry.why_excited}</p>
        </div>
      )}
      {entry.current_workflow && (
        <div className="mb-3">
          <div className="text-2xs uppercase tracking-wider text-muted-2 mb-0.5">today</div>
          <p className="text-sm text-muted">{entry.current_workflow}</p>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <form action={approveWaitlistAction}>
          <input type="hidden" name="id" value={entry.id} />
          <button
            type="submit"
            className="bg-gold text-bg font-semibold px-4 py-1.5 rounded-md text-sm hover:bg-gold-hover transition-colors"
          >
            approve · send invite
          </button>
        </form>
        <form action={rejectWaitlistAction}>
          <input type="hidden" name="id" value={entry.id} />
          <button
            type="submit"
            className="border border-line text-muted px-4 py-1.5 rounded-md text-sm hover:border-crimson hover:text-crimson transition-colors"
          >
            reject
          </button>
        </form>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-2xs uppercase tracking-[0.2em] text-muted-2 mb-3">{title}</h2>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line/60 bg-surface-2/30 p-8 text-center text-muted">
      {text}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const color =
    status === 'approved' ? 'text-win-green border-win-green/40'
    : status === 'rejected' ? 'text-crimson border-crimson/40'
    : 'text-muted-2 border-line/40'
  return (
    <span className={`inline-block text-2xs uppercase tracking-wider px-2 py-0.5 rounded border ${color}`}>
      {status}
    </span>
  )
}

function Banner({ sp }: { sp: SearchParams }) {
  if (sp.ok === 'approved') {
    return (
      <div className="rounded-lg border border-win-green/30 bg-win-green/10 px-4 py-2 text-win-green text-sm mb-6">
        Invite sent to {sp.email ? decodeURIComponent(sp.email) : 'the applicant'}.
      </div>
    )
  }
  if (sp.ok === 'rejected') {
    return (
      <div className="rounded-lg border border-line bg-surface-3 px-4 py-2 text-muted text-sm mb-6">
        Marked rejected.
      </div>
    )
  }
  if (sp.error) {
    const msg =
      sp.error === 'forbidden' ? 'not authorized'
      : sp.error === 'notfound' ? 'waitlist entry not found'
      : sp.error === 'already' ? 'already approved'
      : sp.error === 'invite_db' ? "couldn't create invite — try again"
      : 'something went wrong'
    return (
      <div className="rounded-lg border border-crimson/30 bg-crimson/10 px-4 py-2 text-crimson text-sm mb-6">
        {msg}
      </div>
    )
  }
  return null
}
