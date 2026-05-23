import Link from 'next/link'
import { signupAction } from './actions'

export const dynamic = 'force-dynamic'

export default function SignupPage({ searchParams }: { searchParams: { ok?: string } }) {
  const submitted = searchParams.ok === '1'

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-[#FFD700] tracking-tight mb-1">
          HELLDOCK
        </h1>
        <p className="text-[#6B7280] text-sm mb-8">
          coaching analytics for valorant esports teams
        </p>

        {submitted ? (
          <div className="bg-[#2C2C32] rounded-xl p-6">
            <p className="text-white font-medium mb-2">you&rsquo;re on the list</p>
            <p className="text-[#6B7280] text-sm mb-4">
              we&rsquo;ll email you when your org is activated. usually within a few days.
            </p>
            <Link
              href="/login"
              className="text-[#FFD700] text-sm hover:underline"
            >
              already approved? sign in →
            </Link>
          </div>
        ) : (
          <form
            action={signupAction}
            className="bg-[#2C2C32] rounded-xl p-6 flex flex-col gap-4"
          >
            <p className="text-white text-sm mb-2">
              tell us about your org and we&rsquo;ll review your invite request.
            </p>

            <div>
              <label className="block text-sm text-[#6B7280] mb-1.5">email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="coach@your-team.gg"
                className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-[#6B7280] mb-1.5">org / team name</label>
              <input
                name="org_name"
                type="text"
                required
                maxLength={120}
                placeholder="e.g. Apex Esports"
                className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-sm text-[#6B7280] mb-1.5">
                what would you use helldock for?
              </label>
              <textarea
                name="why_excited"
                rows={3}
                maxLength={500}
                placeholder="scrim review · opponent prep · player development · ..."
                className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-[#6B7280] mb-1.5">
                what do you use today? (optional)
              </label>
              <input
                name="current_workflow"
                type="text"
                maxLength={200}
                placeholder="excel / sheets / tracker / coach notes / nothing"
                className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              className="bg-[#FFD700] text-[#1B1B1F] font-semibold rounded-lg py-2 px-4 hover:bg-yellow-300 transition-colors text-sm"
            >
              join the waitlist
            </button>

            <Link
              href="/login"
              className="text-[#6B7280] text-xs hover:text-white transition-colors text-center"
            >
              already have an account? sign in →
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
