import { redirect } from 'next/navigation'
import AppNav from './AppNav'
import { getSelectedTeamSlug } from '@/lib/team-session'
import { getCurrentTeamRole } from '@/components/RoleGate'
import { getCurrentUserContext } from '@/lib/authz'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')

  const currentTeamSlug = getSelectedTeamSlug()
  const role = await getCurrentTeamRole()

  // Suspension gate: if the user's selected team belongs to a suspended org,
  // and the user isn't platform_admin, send them to /suspended.
  if (currentTeamSlug && !ctx.isPlatformAdmin) {
    const selectedOrg = ctx.memberships.find((o) =>
      o.teams.some((t) => t.teamSlug === currentTeamSlug)
    )
    if (selectedOrg?.suspended) {
      redirect('/suspended')
    }
  }

  const canEdit = role === 'coach' || role === 'org_admin' || role === 'org_owner' || role === 'platform_admin'
  // canViewRoster = analyst + every higher tier. Players + viewers are excluded.
  const canViewRoster = role === 'analyst' || canEdit
  const isOrgAdmin = role === 'org_admin' || role === 'org_owner' || role === 'platform_admin'
  const isPlatformAdmin = role === 'platform_admin'

  return (
    <>
      <AppNav
        currentTeamSlug={currentTeamSlug}
        capabilities={{ canViewRoster, canEdit, isOrgAdmin, isPlatformAdmin }}
      />
      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
    </>
  )
}
