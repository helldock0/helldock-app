import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-bold text-crimson mb-3">Org suspended</h1>
        <p className="text-muted mb-6">
          This Helldock org has been suspended. Until it&rsquo;s reinstated, members
          can&rsquo;t access matches, analytics, or settings.
        </p>
        <p className="text-muted-2 text-sm mb-8">
          If you think this is a mistake, contact the platform admin.
        </p>
        <div className="flex flex-col gap-3 items-center">
          <a
            href="mailto:jamesjoy696@gmail.com"
            className="text-gold hover:underline"
          >
            contact admin →
          </a>
          <Link href="/" className="text-muted-2 text-xs hover:text-muted">
            back to landing
          </Link>
        </div>
      </div>
    </div>
  )
}
