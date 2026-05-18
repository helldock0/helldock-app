import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppNav from './AppNav'
import { getSelectedTeamSlug } from '@/lib/team-session'

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const currentTeamSlug = getSelectedTeamSlug()

  return (
    <>
      <AppNav currentTeamSlug={currentTeamSlug} />
      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
    </>
  )
}
