'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import GlobalSearch from './GlobalSearch'

type NavCapabilities = {
  canViewRoster: boolean   // analyst + above (analyst, coach, org_admin, platform_admin)
  canEdit: boolean         // coach + above
  isOrgAdmin: boolean      // org_admin / org_owner / platform_admin
  isPlatformAdmin: boolean
}

type LinkMinRole = 'player' | 'analyst' | 'coach' | 'org_admin'

type NavLink = {
  href: string
  label: string
  match: (p: string) => boolean
  minRole: LinkMinRole
}

const NAV_GROUPS: Array<{ label: string; links: NavLink[] }> = [
  {
    label: 'Command',
    links: [
      { href: '/app', label: 'Home', match: (p) => p === '/app', minRole: 'player' },
      {
        href: '/app/matches',
        label: 'Matches',
        match: (p) => p.startsWith('/app/matches') && p !== '/app/matches/new',
        minRole: 'player',
      },
      {
        href: '/app/calendar',
        label: 'Calendar',
        match: (p) => p.startsWith('/app/calendar'),
        minRole: 'player',
      },
    ],
  },
  {
    label: 'Analysis',
    links: [
      {
        href: '/app/analytics',
        label: 'Analytics',
        match: (p) => p.startsWith('/app/analytics'),
        minRole: 'player',
      },
      {
        href: '/app/trends',
        label: 'Trends',
        match: (p) => p.startsWith('/app/trends'),
        minRole: 'player',
      },
      {
        href: '/app/prep',
        label: 'Prep',
        match: (p) => p.startsWith('/app/prep') || p.startsWith('/app/opponents'),
        minRole: 'player',
      },
    ],
  },
  {
    label: 'Team',
    links: [
      {
        href: '/app/me',
        label: 'My stats',
        match: (p) => p.startsWith('/app/me'),
        minRole: 'player',
      },
      {
        href: '/app/roster',
        label: 'Roster',
        match: (p) => p.startsWith('/app/roster'),
        minRole: 'analyst',
      },
      {
        href: '/app/team/members',
        label: 'Members',
        match: (p) => p.startsWith('/app/team/members'),
        minRole: 'org_admin',
      },
    ],
  },
]

const OPS_LINKS: NavLink[] = [
  {
    href: '/app/import',
    label: 'Import',
    match: (p) => p.startsWith('/app/import'),
    minRole: 'coach',
  },
]

function canSee(linkMinRole: LinkMinRole, caps: NavCapabilities): boolean {
  if (linkMinRole === 'player') return true
  if (linkMinRole === 'analyst') return caps.canViewRoster
  if (linkMinRole === 'coach') return caps.canEdit
  return caps.isOrgAdmin
}

export default function AppNav({
  currentTeamSlug,
  capabilities,
}: {
  currentTeamSlug: string | null
  capabilities: NavCapabilities
}) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => canSee(link.minRole, capabilities)),
  })).filter((group) => group.links.length > 0)
  const visibleOpsLinks = OPS_LINKS.filter((link) => canSee(link.minRole, capabilities))
  const mobileLinks = visibleGroups.flatMap((group) => group.links).concat(visibleOpsLinks)

  if (pathname === '/app/select-team') return null

  function renderNavLink(link: NavLink, variant: 'desktop' | 'mobile' = 'desktop') {
    const active = link.match(pathname)
    const base =
      variant === 'desktop'
        ? 'relative px-2.5 py-1.5 text-sm rounded-md transition-colors'
        : 'px-2.5 py-1.5 text-sm rounded-md transition-colors'
    const colors =
      active
        ? variant === 'desktop'
          ? 'text-gold'
          : 'text-gold bg-gold/10'
        : 'text-muted hover:text-fg'

    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? 'page' : undefined}
        className={`${base} ${colors}`}
      >
        {link.label}
        {active && variant === 'desktop' && (
          <span className="absolute -bottom-[15px] left-2 right-2 h-[2px] bg-gold rounded-t-full" />
        )}
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 min-h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app" className="flex items-baseline gap-2 group">
            <span className="text-gold font-bold tracking-[0.18em] text-sm group-hover:text-gold-hover transition-colors">
              HELLDOCK
            </span>
            <span className="text-2xs text-muted-2 uppercase tracking-[0.2em] hidden sm:inline">
              scrim ops
            </span>
          </Link>

          {currentTeamSlug && (
            <button
              type="button"
              onClick={() => router.push('/app/select-team')}
              title="Switch team"
              className="
                inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-gold/40 bg-gold/10
                text-gold text-2xs font-bold uppercase tracking-[0.18em]
                hover:bg-gold/15 hover:border-gold/60 transition-colors
                focus:outline-none focus-visible:border-gold
              "
            >
              {currentTeamSlug}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </div>

        <div className="hidden md:flex flex-1 max-w-xs justify-center mx-4">
          <GlobalSearch />
        </div>

        <nav className="hidden lg:flex items-center gap-2 whitespace-nowrap">
          {visibleGroups.map((group, index) => (
            <div
              key={group.label}
              className={`flex items-center gap-1 ${index === 0 ? '' : 'pl-2 border-l border-line'}`}
            >
              <span className="hidden 2xl:inline text-2xs uppercase tracking-[0.16em] text-muted-2 px-1">
                {group.label}
              </span>
              {group.links.map((link) => renderNavLink(link))}
            </div>
          ))}

          {/* Trailing cluster — visually separated from primary nav */}
          <div className="flex items-center gap-1 ml-3 pl-3 border-l border-line">
            {visibleOpsLinks.map((link) => renderNavLink(link))}
            {capabilities.canEdit && (
              <Link
                href="/app/matches/new"
                className="px-3 py-1.5 bg-gold text-black font-semibold rounded-md text-sm hover:bg-gold-hover transition-colors"
              >
                + New
              </Link>
            )}
            {capabilities.isPlatformAdmin && (
              <Link
                href="/admin"
                className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                  pathname.startsWith('/admin')
                    ? 'border-gold text-gold'
                    : 'border-gold/40 text-gold/80 hover:border-gold hover:text-gold'
                }`}
              >
                Admin
              </Link>
            )}
            {capabilities.canEdit && (
              <Link
                href="/app/settings"
                aria-label="Team settings"
                title="Team settings"
                className={`p-1.5 rounded-md transition-colors ${
                  pathname.startsWith('/app/settings')
                    ? 'text-gold'
                    : 'text-muted hover:text-fg'
                }`}
              >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          )}
          </div>
        </nav>
      </div>

      <div className="lg:hidden border-t border-line/70 px-3 py-2 overflow-x-auto">
        <nav className="flex items-center gap-1 min-w-max whitespace-nowrap">
          {mobileLinks.map((link) => renderNavLink(link, 'mobile'))}
          {capabilities.canEdit && (
            <Link
              href="/app/matches/new"
              className="px-2.5 py-1.5 bg-gold text-black font-semibold rounded-md text-sm hover:bg-gold-hover transition-colors"
            >
              + New
            </Link>
          )}
          {capabilities.isPlatformAdmin && (
            <Link
              href="/admin"
              className={`px-2.5 py-1.5 text-sm rounded-md border transition-colors ${
                pathname.startsWith('/admin')
                  ? 'border-gold text-gold'
                  : 'border-gold/40 text-gold/80 hover:border-gold hover:text-gold'
              }`}
            >
              Admin
            </Link>
          )}
          {capabilities.canEdit && (
            <Link
              href="/app/settings"
              className={`px-2.5 py-1.5 text-sm rounded-md transition-colors ${
                pathname.startsWith('/app/settings')
                  ? 'text-gold bg-gold/10'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Settings
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
