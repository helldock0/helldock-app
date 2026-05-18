'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Home', match: (p: string) => p === '/' },
  { href: '/matches', label: 'Matches', match: (p: string) => p.startsWith('/matches') && p !== '/matches/new' },
  { href: '/analytics', label: 'Analytics', match: (p: string) => p.startsWith('/analytics') },
  { href: '/trends', label: 'Trends', match: (p: string) => p.startsWith('/trends') },
  { href: '/import', label: 'Import', match: (p: string) => p.startsWith('/import') },
] as const

export default function AppNav({ currentTeamSlug }: { currentTeamSlug: string | null }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()

  // Picker has its own full-screen layout — hide the global nav there.
  if (pathname === '/select-team') return null

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-baseline gap-2 group">
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
              onClick={() => router.push('/select-team')}
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

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.match(pathname)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`
                  relative px-3 py-1.5 text-sm rounded-md transition-colors
                  ${active ? 'text-gold' : 'text-muted hover:text-fg'}
                `}
              >
                {link.label}
                {active && (
                  <span className="absolute -bottom-[15px] left-2 right-2 h-[2px] bg-gold rounded-t-full" />
                )}
              </Link>
            )
          })}
          <Link
            href="/matches/new"
            className="ml-2 px-3 py-1.5 bg-gold text-black font-semibold rounded-md text-sm hover:bg-gold-hover transition-colors"
          >
            + New
          </Link>
          <Link
            href="/settings"
            aria-label="Team settings"
            title="Team settings"
            className={`ml-1 p-1.5 rounded-md transition-colors ${
              pathname.startsWith('/settings')
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
        </nav>
      </div>
    </header>
  )
}
