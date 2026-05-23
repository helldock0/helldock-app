import Link from 'next/link'
import { signupAction } from './actions'

export const dynamic = 'force-dynamic'

export default function SignupPage({ searchParams }: { searchParams: { ok?: string } }) {
  const submitted = searchParams.ok === '1'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-gold tracking-tight mb-1">
          HELLDOCK
        </h1>
        <p className="text-muted-2 text-sm mb-8">
          coaching analytics for valorant esports teams
        </p>

        {submitted ? (
          <div className="bg-surface-2 rounded-xl p-6">
            <p className="text-fg font-medium mb-2">you&rsquo;re on the list</p>
            <p className="text-muted-2 text-sm mb-4">
              we&rsquo;ll email you when your org is activated. usually within a few days.
            </p>
            <Link
              href="/login"
              className="text-gold text-sm hover:underline"
            >
              already approved? sign in →
            </Link>
          </div>
        ) : (
          <form
            action={signupAction}
            className="bg-surface-2 rounded-xl p-6 flex flex-col gap-4"
          >
            <p className="text-fg text-sm mb-2">
              tell us about your org and we&rsquo;ll review your invite request.
            </p>

            <div>
              <label className="block text-sm text-muted-2 mb-1.5">email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="coach@your-team.gg"
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2 text-fg placeholder:text-muted-2/70 focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-muted-2 mb-1.5">org / team name</label>
              <input
                name="org_name"
                type="text"
                required
                maxLength={120}
                placeholder="e.g. Apex Esports"
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2 text-fg placeholder:text-muted-2/70 focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-muted-2 mb-1.5">
                what would you use helldock for?
              </label>
              <textarea
                name="why_excited"
                rows={3}
                maxLength={500}
                placeholder="scrim review · opponent prep · player development · ..."
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2 text-fg placeholder:text-muted-2/70 focus:outline-none focus:border-gold transition-colors text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-muted-2 mb-1.5">
                what do you use today? (optional)
              </label>
              <input
                name="current_workflow"
                type="text"
                maxLength={200}
                placeholder="excel / sheets / tracker / coach notes / nothing"
                className="w-full bg-surface border border-line-strong rounded-lg px-3 py-2 text-fg placeholder:text-muted-2/70 focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              className="bg-gold text-bg font-semibold rounded-lg py-2 px-4 hover:bg-gold-hover transition-colors text-sm"
            >
              join the waitlist
            </button>

            <Link
              href="/login"
              className="text-muted-2 text-xs hover:text-fg transition-colors text-center"
            >
              already have an account? sign in →
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
