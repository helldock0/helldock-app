import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUserContext } from '@/lib/authz'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCurrentUserContext()
  // Hard 404 for non-platform-admins — don't even leak that /admin exists.
  if (!ctx || !ctx.isPlatformAdmin) notFound()

  return (
    <div className="min-h-screen flex bg-bg">
      <aside className="w-56 border-r border-line bg-surface-2 sticky top-0 h-screen flex flex-col">
        <div className="p-4 border-b border-line">
          <Link href="/admin" className="block">
            <div className="text-gold font-bold tracking-[0.18em] text-sm">HELLDOCK</div>
            <div className="text-2xs text-muted-2 uppercase tracking-[0.2em] mt-0.5">admin</div>
          </Link>
        </div>
        <nav className="p-2 flex flex-col gap-1 text-sm flex-1">
          <AdminLink href="/admin" label="Dashboard" />
          <AdminLink href="/admin/waitlist" label="Waitlist" />
          <AdminLink href="/admin/orgs" label="Orgs" />
          <AdminLink href="/admin/users" label="Users" />
          <AdminLink href="/admin/invites" label="Invites" />
          <AdminLink href="/admin/audit" label="Audit log" />
        </nav>
        <div className="p-4 border-t border-line text-xs">
          <div className="text-muted-2 mb-1 truncate">{ctx.email}</div>
          <Link href="/app" className="text-muted hover:text-gold transition-colors">
            ← back to app
          </Link>
        </div>
      </aside>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

function AdminLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md text-muted hover:text-fg hover:bg-surface-3 transition-colors"
    >
      {label}
    </Link>
  )
}
