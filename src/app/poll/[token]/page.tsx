import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildPollSlots, groupSlotsByDate, tallyResponses, listRespondents } from '@/lib/availability-poll'
import PublicPollClient from './PublicPollClient'

export const dynamic = 'force-dynamic'

export default async function PublicPollPage({
  params,
}: {
  params: { token: string }
}) {
  const supabase = createClient()

  const { data: poll } = await supabase
    .from('availability_poll')
    .select('id, token, title, start_at, end_at, slot_minutes, notes')
    .eq('token', params.token)
    .single()
  if (!poll) notFound()

  const { data: responses } = await supabase
    .from('availability_response')
    .select('respondent_name, slot_at')
    .eq('poll_id', poll.id)

  const allResponses = responses ?? []
  const slots = buildPollSlots(poll.start_at, poll.end_at, poll.slot_minutes)
  const dayGroups = groupSlotsByDate(slots)
  const tally = tallyResponses(allResponses)
  const respondents = listRespondents(allResponses)

  return (
    <main className="px-6 py-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <p className="text-2xs uppercase tracking-[0.25em] text-muted-2">
          when are you free?
        </p>
        <h1 className="text-2xl font-bold text-fg leading-tight mt-1">
          {poll.title ?? 'Scrim availability'}
        </h1>
        {poll.notes && (
          <p className="text-sm text-muted-2 mt-2 whitespace-pre-line">
            {poll.notes}
          </p>
        )}
      </div>

      <PublicPollClient
        token={poll.token}
        dayGroups={dayGroups}
        tally={tally}
        totalRespondents={respondents.length}
        existingResponses={allResponses}
      />
    </main>
  )
}
