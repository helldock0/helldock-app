'use client'

import type { ReviewItem } from '@/lib/review-queue'

type Props = {
  item: ReviewItem
  matchIdHelldock: string
  /** Caller hands us a fn instead of router so this component doesn't need to
   *  know about Next.js routing internals — same pattern as the round-edit
   *  callbacks above this file in MatchDetail. */
  onJumpToRound: (roundNum: number) => void
}

/**
 * One row of the Review tab. Renders the per-round PNG thumb on the left,
 * the score + outcome header + top reasons on the right, and a footer link
 * that flips the parent tab to Rounds and flashes the row.
 */
export default function ReviewItemCard({
  item,
  matchIdHelldock,
  onJumpToRound,
}: Props) {
  const sideLabel =
    item.side === 'Attack' ? 'ATT' : item.side === 'Defense' ? 'DEF' : '—'
  const sideColor =
    item.side === 'Attack' ? 'text-[#FFD700]' : item.side === 'Defense' ? 'text-[#FF6B6B]' : 'text-[#6B7280]'
  const outcomeColor =
    item.outcome === 'W' ? 'text-win-green' : 'text-crimson'
  const accentColor = item.outcome === 'W' ? 'border-l-win-green' : 'border-l-crimson'
  const scorePct = Math.round(item.score * 100)

  const thumbUrl = `/api/matches/${encodeURIComponent(matchIdHelldock)}/rounds/${item.roundNum}/thumb.png`

  // Show top 3 reasons. Anything below that is just noise next to the thumb.
  const topReasons = item.reasons.slice(0, 3)

  return (
    <div
      className={`bg-[#2C2C32] rounded-xl border-l-4 ${accentColor} p-4 flex gap-4 items-start hover:bg-[#33333A] transition-colors`}
    >
      {/* Thumbnail */}
      <div className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl}
          alt={`Round ${item.roundNum} kill heatmap`}
          width={160}
          height={160}
          className="rounded-lg bg-[#1B1B1F] object-cover"
          loading="lazy"
        />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 mb-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              R{item.roundNum}
            </span>
            <span className={`text-xs font-bold uppercase tracking-wider ${sideColor}`}>
              {sideLabel}
            </span>
            {item.roundType && (
              <span className="text-xs text-[#6B7280] uppercase tracking-wider">
                · {item.roundType}
              </span>
            )}
            <span className={`text-sm font-bold ${outcomeColor}`}>
              · {item.outcome === 'W' ? 'won' : 'lost'}
            </span>
            <span className="text-xs text-[#6B7280] tabular-nums">
              [{item.scoreAtStart.ours}–{item.scoreAtStart.theirs}]
            </span>
            {item.coachGrade != null && (
              <span className="text-xs text-[#9CA3AF]">
                · grade {item.coachGrade}/5
              </span>
            )}
            {item.coachGrade == null && (
              <span className="text-xs text-[#FFD700] opacity-80">
                · ungraded
              </span>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-[#6B7280] uppercase tracking-wider">score</div>
            <div className="text-xl font-bold font-mono text-[#FFD700] tabular-nums">
              {scorePct}
            </div>
          </div>
        </div>

        {/* Reasons */}
        <ul className="space-y-1 mb-3">
          {topReasons.map((r, i) => (
            <li key={`${r.kind}-${i}`} className="text-sm text-[#D1D5DB] flex items-start gap-1.5">
              <span className="text-[#FFD700] mt-0.5 shrink-0">↗</span>
              <span className="break-words">{r.text}</span>
            </li>
          ))}
        </ul>

        {/* Footer action */}
        <button
          type="button"
          onClick={() => onJumpToRound(item.roundNum)}
          className="text-xs px-3 py-1.5 rounded-lg bg-[#3C3C44] text-[#6B7280] hover:bg-[#FFD700] hover:text-[#1B1B1F] font-medium transition-colors"
        >
          ▶ Jump to round {item.roundNum} on Rounds tab
        </button>
      </div>
    </div>
  )
}
