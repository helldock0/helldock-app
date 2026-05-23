import { redirect } from 'next/navigation'
import { getCurrentUserContext } from '@/lib/authz'
import { createOrgAction, createTeamAction } from './actions'

export const dynamic = 'force-dynamic'

type SearchParams = { error?: string }

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  // Figure out which step the user is on
  const ownedOrg = ctx.memberships.find((o) => o.orgRole === 'org_owner')

  if (!ownedOrg) {
    return <Step1CreateOrg errorCode={searchParams.error} />
  }
  if (ownedOrg.teams.length === 0) {
    return <Step2CreateTeam orgName={ownedOrg.orgName} errorCode={searchParams.error} />
  }
  // Already has a team — they're done
  redirect('/select-team')
}

function Step1CreateOrg({ errorCode }: { errorCode?: string }) {
  return (
    <Shell step={1} of={2}>
      <h2 className="text-2xl font-bold text-white mb-2">Create your org</h2>
      <p className="text-[#6B7280] text-sm mb-6">
        Your org owns all your teams. You can rename it later.
      </p>
      <form action={createOrgAction} className="flex flex-col gap-4">
        <Field label="Org name" name="name" placeholder="e.g. Apex Esports" required />
        <Field
          label="URL slug"
          name="slug"
          placeholder="apex"
          required
          hint="lowercase letters, numbers, and hyphens"
        />
        <ErrorLine code={errorCode} />
        <button type="submit" className={primaryBtn}>
          create org →
        </button>
      </form>
    </Shell>
  )
}

function Step2CreateTeam({ orgName, errorCode }: { orgName: string; errorCode?: string }) {
  return (
    <Shell step={2} of={2}>
      <h2 className="text-2xl font-bold text-white mb-2">Create your first team</h2>
      <p className="text-[#6B7280] text-sm mb-6">
        Adding a team under <span className="text-[#FFD700]">{orgName}</span>. You can add more teams later.
      </p>
      <form action={createTeamAction} className="flex flex-col gap-4">
        <Field label="Team name" name="name" placeholder="e.g. Apex Main" required />
        <Field label="URL slug" name="slug" placeholder="apex-main" required />
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Main Riot name (optional)" name="riot_name" placeholder="IGN" />
          </div>
          <Field label="Tag" name="riot_tag" placeholder="123" />
        </div>
        <ErrorLine code={errorCode} />
        <button type="submit" className={primaryBtn}>
          create team →
        </button>
      </form>
    </Shell>
  )
}

function Shell({ step, of, children }: { step: number; of: number; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-4xl font-bold text-[#FFD700] tracking-tight mb-1">HELLDOCK</h1>
        <p className="text-[#6B7280] text-sm mb-6">
          setup · step {step} of {of}
        </p>
        <div className="bg-[#2C2C32] rounded-xl p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  name,
  placeholder,
  required,
  hint,
}: {
  label: string
  name: string
  placeholder?: string
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-sm text-[#6B7280] mb-1.5">{label}</label>
      <input
        name={name}
        type="text"
        required={required}
        placeholder={placeholder}
        className="w-full bg-[#1B1B1F] border border-[#3C3C44] rounded-lg px-3 py-2 text-white placeholder-[#4B5563] focus:outline-none focus:border-[#FFD700] transition-colors text-sm"
      />
      {hint && <p className="text-[#4B5563] text-xs mt-1">{hint}</p>}
    </div>
  )
}

function ErrorLine({ code }: { code?: string }) {
  if (!code) return null
  return <p className="text-[#DC143C] text-xs">{describeOnboardingError(code)}</p>
}

function describeOnboardingError(code: string): string {
  switch (code) {
    case 'org_name': return 'org name required'
    case 'org_slug': return 'slug must be lowercase letters, numbers, hyphens (3+ chars)'
    case 'org_slug_taken': return 'that slug is taken — try another'
    case 'org_db': return "couldn't create org — try again"
    case 'no_org': return 'no org found for your account — try the org step first'
    case 'team_name': return 'team name required'
    case 'team_slug': return 'team slug must be lowercase letters, numbers, hyphens (3+ chars)'
    case 'team_slug_taken': return 'that team slug is taken — try another'
    case 'team_db': return "couldn't create team — try again"
    default: return 'something went wrong'
  }
}

const primaryBtn =
  'bg-[#FFD700] text-[#1B1B1F] font-semibold rounded-lg py-2 px-4 hover:bg-yellow-300 transition-colors text-sm'
