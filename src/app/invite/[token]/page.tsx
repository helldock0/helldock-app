import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hashInviteToken } from '@/lib/invites/token'
import { acceptInviteAction, sendInviteMagicLinkAction } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = {
  sent?: string
  error?: string
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string }
  searchParams: SearchParams
}) {
  const admin = createAdminClient()
  const hash = hashInviteToken(params.token)
  const { data: invite } = await admin
    .from('invites')
    .select('id, email, org_id, team_id, intended_role, expires_at, accepted_at')
    .eq('token_hash', hash)
    .maybeSingle()

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-gold tracking-tight mb-1">HELLDOCK</h1>
        <p className="text-muted-2 text-sm mb-8">invite</p>

        {!invite ? (
          <StateCard>
            <p className="text-fg font-medium mb-1">invite not found</p>
            <p className="text-muted-2 text-sm">
              the link is invalid or has been revoked.
            </p>
          </StateCard>
        ) : invite.accepted_at ? (
          <StateCard>
            <p className="text-fg font-medium mb-1">already accepted</p>
            <p className="text-muted-2 text-sm">this invite has been used.</p>
          </StateCard>
        ) : new Date(invite.expires_at) < new Date() ? (
          <StateCard>
            <p className="text-fg font-medium mb-1">expired</p>
            <p className="text-muted-2 text-sm">
              ask the person who invited you to send a new one.
            </p>
          </StateCard>
        ) : (
          <InviteSurface
            invite={invite}
            token={params.token}
            sent={searchParams.sent === '1'}
            errorCode={searchParams.error}
          />
        )}
      </div>
    </div>
  )
}

function StateCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-surface-2 rounded-xl p-6">{children}</div>
}

async function InviteSurface({
  invite,
  token,
  sent,
  errorCode,
}: {
  invite: { email: string; org_id: string | null; intended_role: string }
  token: string
  sent: boolean
  errorCode?: string
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (sent) {
    return (
      <StateCard>
        <p className="text-fg font-medium mb-1">check your inbox</p>
        <p className="text-muted-2 text-sm">
          magic link sent to{' '}
          <span className="text-gold">{invite.email}</span>. click the link
          to come back here, then claim your invite.
        </p>
      </StateCard>
    )
  }

  if (!user) {
    return (
      <form action={sendInviteMagicLinkAction} className="bg-surface-2 rounded-xl p-6 flex flex-col gap-4">
        <div>
          <p className="text-fg font-medium mb-1">you&rsquo;re invited</p>
          <p className="text-muted-2 text-sm">
            sign in as <span className="text-gold">{invite.email}</span> to{' '}
            {invite.org_id ? 'join your team' : 'set up your org'}.
          </p>
        </div>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={invite.email} />
        {errorCode && (
          <p className="text-crimson text-xs">{describeError(errorCode)}</p>
        )}
        <button
          type="submit"
          className="bg-gold text-bg font-semibold rounded-lg py-2 px-4 hover:bg-gold-hover transition-colors text-sm"
        >
          send magic link
        </button>
      </form>
    )
  }

  // Authed but wrong email
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <StateCard>
        <p className="text-fg font-medium mb-1">wrong account</p>
        <p className="text-muted-2 text-sm">
          this invite is for{' '}
          <span className="text-gold">{invite.email}</span>. you&rsquo;re signed in as{' '}
          <span className="text-fg">{user.email}</span>. sign out and try again.
        </p>
      </StateCard>
    )
  }

  // Authed + matching email — show accept button
  return (
    <form action={acceptInviteAction} className="bg-surface-2 rounded-xl p-6 flex flex-col gap-4">
      <div>
        <p className="text-fg font-medium mb-1">accept your invite</p>
        <p className="text-muted-2 text-sm">
          {invite.org_id
            ? `you'll be added as ${invite.intended_role}.`
            : `you'll create your own org and become the owner.`}
        </p>
      </div>
      <input type="hidden" name="token" value={token} />
      {errorCode && (
        <p className="text-crimson text-xs">{describeError(errorCode)}</p>
      )}
      <button
        type="submit"
        className="bg-gold text-bg font-semibold rounded-lg py-2 px-4 hover:bg-gold-hover transition-colors text-sm"
      >
        {invite.org_id ? 'join' : 'set up my org'}
      </button>
    </form>
  )
}

function describeError(code: string): string {
  switch (code) {
    case 'missing': return 'missing email or token'
    case 'otp': return "couldn't send the magic link — try again in a sec"
    case 'notfound': return 'invite no longer exists'
    case 'expired': return 'invite expired'
    case 'wrongemail': return 'signed in with the wrong email'
    default: return 'something went wrong — try again'
  }
}
