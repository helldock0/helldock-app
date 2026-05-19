import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { requireSelectedTeam } from '@/lib/team-session'
import {
  buildPollSlots,
  groupSlotsByDate,
  tallyResponses,
  listRespondents,
  buildRespondentGrid,
} from '@/lib/availability-poll'
import PollDetailClient from './PollDetailClient'

export const dynamic = 'force-dynamic'

export default async function PollDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { teamId } = await requireSelectedTeam()
  const supabase = createClient()

  const { data: poll } = await supabase
    .from('availability_poll')
    .select('id, token, title, start_at, end_at, slot_minutes, notes, created_at')
    .eq('id', params.id)
    .eq('team_id', teamId)
    .single()
  if (!poll) notFound()

  const { data: responses } = await supabase
    .from('availability_response')
    .select('respondent_name, slot_at')
    .eq('poll_id', poll.id)

  const allResponses = responses ?? []
  const slots = buildPollSlots(poll.start_at, poll.end_at, poll.slot_minutes)
  const tally = tallyResponses(allResponses)
  const respondents = listRespondents(allResponses)
  const grid = buildRespondentGrid(allResponses, slots)
  const dayGroups = groupSlotsByDate(slots)

  // Build the public share link from the request origin so it survives prod.
  const h = headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('host') ?? ''
  const shareUrl = host ? `${proto}://${host}/poll/${poll.token}` : `/poll/${poll.token}`

  return (
    <main className="px-6 py-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <Link
          href="/polls"
          className="text-2xs uppercase tracking-[0.16em] text-muted-2 hover:text-gold transition-colors"
        >
          ← all polls
        </Link>
        <p className="mt-1 text-2xs uppercase tracking-[0.25em] text-muted-2">
          poll
        </p>
        <h1 className="text-2xl font-bold text-fg leading-tight">
          {poll.title ?? 'untitled poll'}
        </h1>
        {poll.notes && (
          <p className="text-sm text-muted-2 mt-1 whitespace-pre-line">
            {poll.notes}
          </p>
        )}
      </div>

      <PollDetailClient
        pollId={poll.id}
        shareUrl={shareUrl}
        respondents={respondents}
        dayGroups={dayGroups}
        tally={tally}
        grid={grid}
      />
    </main>
  )
}
