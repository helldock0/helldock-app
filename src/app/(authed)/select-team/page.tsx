import { createClient } from '@/lib/supabase/server'
import { selectTeamAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function SelectTeamPage() {
  const supabase = createClient()
  const { data: teams } = await supabase
    .from('teams')
    .select('id, slug, name')
    .order('name')

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-10">
          <p className="text-2xs uppercase tracking-[0.3em] text-muted-2 mb-3">
            helldock · scrim ops
          </p>
          <h1 className="text-4xl font-bold text-gold tracking-tight mb-3">
            Pick your team
          </h1>
          <p className="text-muted text-sm">
            All matches, players, and analytics will scope to your choice.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(teams ?? []).map((t) => (
            <form key={t.id} action={selectTeamAction}>
              <input type="hidden" name="slug" value={t.slug} />
              <button
                type="submit"
                className="
                  group w-full text-left
                  bg-surface-2 border border-line-strong/40 rounded-2xl p-8
                  transition-all duration-200 ease-out
                  hover:border-gold/60 hover:bg-surface-3
                  focus:outline-none focus-visible:border-gold
                "
              >
                <div className="text-2xs uppercase tracking-[0.25em] text-muted-2 mb-3">
                  team
                </div>
                <div className="text-3xl font-bold text-fg tracking-tight mb-2 group-hover:text-gold transition-colors">
                  {t.name.replace(/^SOP\s+/i, '')}
                </div>
                <div className="text-xs text-muted-2 font-mono uppercase tracking-wider">
                  {t.slug}
                </div>
                <div className="mt-6 inline-flex items-center gap-1 text-xs text-gold opacity-0 group-hover:opacity-100 transition-opacity">
                  open command center →
                </div>
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  )
}
