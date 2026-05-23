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

  const canEdit = role === 'coach' || role === 'org_admin' || role === 'org_owner' || role === 'platform_admin'
  const isOrgAdmin = role === 'org_admin' || role === 'org_owner' || role === 'platform_admin'
  const isPlatformAdmin = role === 'platform_admin'

  return (
    <>
      <AppNav
        currentTeamSlug={currentTeamSlug}
        capabilities={{ canEdit, isOrgAdmin, isPlatformAdmin }}
      />
      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
    </>
  )
}
