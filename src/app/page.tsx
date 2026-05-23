import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Top bar */}
      <header className="border-b border-line/40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-gold font-bold tracking-[0.18em] text-sm">HELLDOCK</span>
            <span className="text-muted-2 text-2xs uppercase tracking-[0.2em] hidden sm:inline">
              scrim ops
            </span>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="text-muted-2 hover:text-fg transition-colors px-3 py-1.5"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-gold text-bg font-semibold px-4 py-1.5 rounded-md hover:bg-gold-hover transition-colors"
            >
              Join waitlist
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="text-gold text-2xs uppercase tracking-[0.3em] mb-6">
          coaching analytics for valorant esports teams
        </p>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-[1.05]">
          Scrim review,{' '}
          <span className="text-gold">without the spreadsheet.</span>
        </h1>
        <p className="text-muted text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Helldock turns every custom match into a coach-ready breakdown — PULSE
          dashboard, comp lab, opponent dossier, per-player impact. Built for
          tier-2/3 teams who want pro-level review without the pro-level staff.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/signup"
            className="bg-gold text-bg font-semibold px-6 py-3 rounded-md hover:bg-gold-hover transition-colors"
          >
            Join the alpha waitlist
          </Link>
        </div>
        <p className="text-muted-2/70 text-xs mt-6">
          Currently in private alpha with two competing teams. Email approval typically takes a few days.
        </p>
      </section>

      {/* Feature pillars */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xs uppercase tracking-[0.3em] text-muted-2 mb-2 text-center">
          what helldock gives you
        </h2>
        <p className="text-center text-2xl text-fg font-bold mb-12">
          Four tools that replace your scrim-review xlsx.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            title="PULSE"
            sub="What's broken / what's working / opp intel"
            body="The dashboard your coach actually opens. Last-N rolling map W%, side bias drift, who's heating up, who's slumping."
          />
          <FeatureCard
            title="Comp Lab"
            sub="Per-map composition outcomes"
            body="Auto-classifies your comps (Standard / Double Init / etc.), tags winners + losers, surfaces the ones worth practicing."
          />
          <FeatureCard
            title="Opp Dossier"
            sub="Pre-series prep in 30 seconds"
            body="Their map pool · top comps · pistol W% · plant rate. Copy as Discord brief. We did the legwork."
          />
          <FeatureCard
            title="Player Impact"
            sub="HLTV-style ratings for VAL"
            body="Trade%, Drag, Carry, Rating 2.0, KST%. Stop arguing about who fragged — measure who actually moved the needle."
          />
        </div>
      </section>

      {/* Problem statement */}
      <section className="max-w-4xl mx-auto px-6 py-16 border-t border-line/40">
        <h2 className="text-2xs uppercase tracking-[0.3em] text-muted-2 mb-3 text-center">
          why we&rsquo;re building this
        </h2>
        <h3 className="text-3xl font-bold text-fg text-center mb-6">
          Excel scrim review is broken.
        </h3>
        <ul className="text-muted text-base space-y-3 max-w-2xl mx-auto">
          <li className="flex gap-3">
            <span className="text-gold">→</span>
            <span>
              Coaches paste KDA into Sheets, lose 30 min, and still don&rsquo;t know if the round 7 rotate was the right call.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold">→</span>
            <span>
              Tracker.gg and Mobalytics focus on solo ranked. They don&rsquo;t help you watch your team review a scrim block.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold">→</span>
            <span>
              The pro-tier video review software (StatsHelix, Shadow.gg) starts at $500/mo and is built for franchises, not tier-2/3 grinders.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="text-gold">→</span>
            <span>
              Helldock sits in the middle. Coach-grade analytics for teams who can&rsquo;t afford a dedicated stats coach yet.
            </span>
          </li>
        </ul>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-fg mb-4">
          Ready to ditch the spreadsheet?
        </h2>
        <p className="text-muted mb-8">
          Drop your org name + email. We&rsquo;ll review and send your invite within a few days.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-gold text-bg font-semibold px-8 py-3 rounded-md hover:bg-gold-hover transition-colors"
        >
          Join the waitlist →
        </Link>
      </section>

      <footer className="border-t border-line/40 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs text-muted-2/70 uppercase tracking-wider">
          <span>helldock © 2026 · private alpha</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-gold transition-colors">sign in</Link>
            <Link href="/signup" className="hover:text-gold transition-colors">waitlist</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({ title, sub, body }: { title: string; sub: string; body: string }) {
  return (
    <div className="bg-surface border border-line/40 rounded-xl p-6 hover:border-gold/30 transition-colors">
      <h3 className="text-gold font-bold text-lg mb-1">{title}</h3>
      <p className="text-muted-2 text-xs uppercase tracking-wider mb-3">{sub}</p>
      <p className="text-muted text-sm leading-relaxed">{body}</p>
    </div>
  )
}
