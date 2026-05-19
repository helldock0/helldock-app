import Link from 'next/link'
import NewPollForm from './NewPollForm'

export default function NewPollPage() {
  return (
    <main className="px-6 py-6 max-w-xl mx-auto">
      <div className="mb-6">
        <Link
          href="/polls"
          className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
        >
          ← all polls
        </Link>
        <p className="mt-1 text-2xs uppercase tracking-[0.25em] text-muted-2">
          new availability poll
        </p>
        <h1 className="text-2xl font-bold text-fg leading-tight">
          Pick a window
        </h1>
        <p className="text-xs text-muted-2 mt-2">
          Helldock generates a public link your players open to mark when
          they&apos;re free. No accounts needed.
        </p>
      </div>
      <NewPollForm />
    </main>
  )
}
