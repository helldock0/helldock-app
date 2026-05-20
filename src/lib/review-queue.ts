// Algorithmic "Review Queue" — auto-rank match rounds by coach-relevance.
//
// Composes existing signals (WP model, clutches, coach grades, FB/FD,
// streak-break detection) into a 0..1 review-relevance score per round.
// Surfaces top N (default 5) with one-line reasons so the coach knows where
// to look first instead of scrolling through 24 rounds of scoreboards.
//
// Pure compute — no DB calls, no side effects. All inputs are caller-provided
// so the same function powers the match-detail Review tab AND the cross-match
// dashboard card.
//
// Lift target: Augment.gg's bookmark-driven review workflow (manual) → we
// flip it to algorithmic prioritization since Helldock serves one coach per
// team and that coach hasn't got 60–70 hrs/month to spend on bookmarking.

import {
  predictWinProbability,
  extractFeatures,
  type WPRound,
  type WPWeights,
} from '@/lib/win-probability'

// High-signal coach tags — the ones that mean "this round has a story to tell."
// Tag list from S12 (rounds.coach_tags). Excluded the positive tags (good_*) +
// neutral clutch tag since they don't on their own scream "review this."
const HIGH_SIGNAL_TAGS = new Set([
  'bad_rotate',
  'setup_failed',
  'force_mistake',
  'bad_economy',
])

// ── Public types ─────────────────────────────────────────────────────────────

export type ReviewReason =
  | { kind: 'wp_surprise'; text: string; weight: number }
  | { kind: 'leverage'; text: string; weight: number }
  | { kind: 'low_grade'; text: string; weight: number }
  | { kind: 'ungraded_anomaly'; text: string; weight: number }
  | { kind: 'clutch'; text: string; weight: number }
  | { kind: 'streak_break'; text: string; weight: number }
  | { kind: 'fd_loss'; text: string; weight: number }
  | { kind: 'tag_signal'; text: string; weight: number }

export type ReviewItem = {
  roundNum: number
  score: number // 0..1 composite, larger = look here first
  outcome: 'W' | 'L'
  side: 'Attack' | 'Defense' | null
  roundType: string | null
  scoreAtStart: { ours: number; theirs: number }
  reasons: ReviewReason[] // sorted by weight desc; non-contributing signals omitted
  coachGrade: number | null
  coachTags: string[]
  hasClutch: boolean
  clutchType: string | null
  clutchPlayer: string | null
  wpPredicted: number // 0..100, model output before the round
  wpSurprise: number // |predicted/100 - actual outcome (0 or 1)|, 0..1
  wpa: number // |wp_post - wp_pre|, win-probability-added by this round, 0..1
}

// What computeReviewQueue needs about each round of the match. Caller maps
// from their DB row shape — we keep this input type narrow to make the lib
// easy to reuse (match-detail server component + dashboard cross-match card).
export type ReviewQueueRound = {
  round_num: number
  side: string | null
  outcome: string | null // 'W' | 'L' | null
  round_type: string | null
  our_econ: number | null
  their_econ: number | null
  first_blood: string | null // 'us' | 'them' | null
  clutch_type: string | null
  clutch_player: string | null
  coach_grade: number | null
  coach_tags: string[] | null
}

// ── Scoring weights ──────────────────────────────────────────────────────────
//
// Tunable constants live at module top so future tweaks are one edit. The mix
// favors signals that don't require manual coach input (WP surprise, leverage,
// clutch) so the queue is useful even on a freshly-imported match with no
// coach grades yet.

const W_WP_SURPRISE = 0.3
const W_LEVERAGE = 0.25
const W_LOW_GRADE = 0.2
const W_UNGRADED_ANOMALY = 0.2
const W_CLUTCH = 0.15
const W_STREAK_BREAK = 0.1
const W_FD_LOSS = 0.1
const W_TAG_PER = 0.05

// WP surprise below this is too small to be interesting (the model was right).
const WP_SURPRISE_THRESHOLD = 0.3
// Leverage normalization — saturate at this absolute |WPA|.
const LEVERAGE_SAT = 0.5
// Streak length required to register the "streak break" signal.
const STREAK_BREAK_LEN = 3

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp01(x: number): number {
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function pickSide(side: string | null): 'Attack' | 'Defense' | null {
  return side === 'Attack' || side === 'Defense' ? side : null
}

function pickOutcome(outcome: string | null): 'W' | 'L' | null {
  return outcome === 'W' || outcome === 'L' ? outcome : null
}

// Build the pre-round WP for every round of a single match (0..1 instead of
// the 0..100 returned by computeMatchWinProbabilities, which is rounded to one
// decimal — we want full precision for scoring).
function buildPreRoundWP(
  weights: WPWeights,
  rounds: ReviewQueueRound[]
): Map<number, number> {
  const sorted = rounds.slice().sort((a, b) => a.round_num - b.round_num)
  const map = new Map<number, number>()
  let ourWins = 0
  let theirWins = 0
  for (const r of sorted) {
    const wpRound: WPRound = {
      match_id: '',
      round_num: r.round_num,
      side: r.side,
      outcome: r.outcome,
      round_type: r.round_type,
      our_econ: r.our_econ,
      their_econ: r.their_econ,
    }
    const features = extractFeatures(wpRound, ourWins - theirWins)
    const wpPct = predictWinProbability(weights, features) // 0..100
    map.set(r.round_num, wpPct / 100)
    if (r.outcome === 'W') ourWins++
    else if (r.outcome === 'L') theirWins++
  }
  return map
}

// Did the team's W/L run flip at this round? E.g. lost 3+ in a row before this
// round, then won this one (or vice versa). Encodes "momentum break" — a
// stand-out moment in the rhythm of the match.
function breaksStreak(
  sortedRounds: ReviewQueueRound[],
  idx: number,
  minLen: number
): boolean {
  const here = pickOutcome(sortedRounds[idx].outcome)
  if (!here) return false
  // Walk backwards to count the streak that *ended* before this round.
  let run = 0
  let prev: 'W' | 'L' | null = null
  for (let j = idx - 1; j >= 0; j--) {
    const o = pickOutcome(sortedRounds[j].outcome)
    if (!o) continue
    if (prev === null) prev = o
    if (o !== prev) break
    run++
  }
  if (prev === null || run < minLen) return false
  return prev !== here
}

// Pre-round score state going INTO this round (counting only outcomes strictly
// before the index — same convention as the WP feature extractor uses).
function scoreAtStart(
  sortedRounds: ReviewQueueRound[],
  idx: number
): { ours: number; theirs: number } {
  let ours = 0
  let theirs = 0
  for (let j = 0; j < idx; j++) {
    const o = pickOutcome(sortedRounds[j].outcome)
    if (o === 'W') ours++
    else if (o === 'L') theirs++
  }
  return { ours, theirs }
}

// ── Reason text builders ─────────────────────────────────────────────────────
//
// Reasons are short, human-readable strings the UI displays next to the
// thumbnail. Keep them under ~60 chars — Discord recap reuses the top reason
// and we don't want it to wrap or get truncated.

function wpSurpriseText(predicted01: number, actual01: number): string {
  const predPct = Math.round(predicted01 * 100)
  const expected = predicted01 >= 0.5 ? 'win' : 'loss'
  const got = actual01 === 1 ? 'won' : 'lost'
  return `WP model said ${predPct}% — expected ${expected}, ${got}`
}

function leverageText(wpa: number): string {
  const swing = Math.round(wpa * 100)
  return `High-leverage round (WP swing ${swing}pp)`
}

function lowGradeText(grade: number): string {
  return `Coach grade ${grade}/5 — flagged for review`
}

function ungradedAnomalyText(predicted01: number): string {
  const predPct = Math.round(predicted01 * 100)
  return `Ungraded but model surprise (${predPct}% pre-round)`
}

function clutchText(clutchType: string, clutchPlayer: string | null): string {
  const who = clutchPlayer ?? 'someone'
  return `${who} ${clutchType} clutch`
}

function streakBreakText(): string {
  return `Broke a streak (≥${STREAK_BREAK_LEN})`
}

function fdLossText(): string {
  return `First-death against us, round lost`
}

function tagSignalText(tags: string[]): string {
  if (tags.length === 1) return `Tag: ${tags[0]}`
  return `Tags: ${tags.slice(0, 2).join(', ')}${tags.length > 2 ? `…` : ''}`
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the review queue for a single match.
 *
 * Returns up to `topN` ReviewItems sorted by score desc. Rounds without a W/L
 * outcome (drawn, voided, missing) are dropped — we can't reason about WP
 * surprise or leverage without knowing how the round ended.
 *
 * The function is robust to:
 *   – `wpWeights == null` (model below sample threshold) → WP-derived signals
 *     are skipped; queue still computes from coach_grade + clutch + fd + tags.
 *   – Rounds passed unsorted → we sort internally.
 *   – Missing fields → individual signals silently no-op.
 */
export function computeReviewQueue(input: {
  rounds: ReviewQueueRound[]
  wpWeights: WPWeights | null
  topN?: number
}): ReviewItem[] {
  const { rounds, wpWeights } = input
  const topN = input.topN ?? 5

  if (!rounds.length) return []

  const sorted = rounds.slice().sort((a, b) => a.round_num - b.round_num)
  const wpMap = wpWeights ? buildPreRoundWP(wpWeights, sorted) : null

  const items: ReviewItem[] = []

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    const outcome = pickOutcome(r.outcome)
    if (!outcome) continue

    const actual01 = outcome === 'W' ? 1 : 0
    const predicted01 = wpMap?.get(r.round_num) ?? null

    // wpSurprise: how wrong the model was about THIS round, 0..1.
    const wpSurprise =
      predicted01 == null ? 0 : Math.abs(predicted01 - actual01)

    // wpa: |WP at round start - WP at next round's start| — leverage of this
    // round. For the final round we substitute |predicted - actual| since
    // there's no "next round." If wpMap is null, leverage is 0.
    let wpa = 0
    if (wpMap) {
      const next = sorted[i + 1]
      const wpPre = predicted01 ?? 0.5
      const wpPost =
        next != null ? (wpMap.get(next.round_num) ?? wpPre) : actual01
      wpa = Math.abs(wpPost - wpPre)
    }

    const reasons: ReviewReason[] = []

    // 1. WP surprise — only fires above threshold so trivial misses don't add
    //    noise. Scaled so a 100% surprise contributes its full weight.
    if (wpSurprise >= WP_SURPRISE_THRESHOLD) {
      const w = W_WP_SURPRISE * wpSurprise
      reasons.push({
        kind: 'wp_surprise',
        text: wpSurpriseText(predicted01!, actual01),
        weight: w,
      })
    }

    // 2. Leverage — saturated; rounds with |WPA| ≥ 0.5 hit max.
    if (wpa > 0) {
      const normalized = Math.min(wpa, LEVERAGE_SAT) / LEVERAGE_SAT
      // Only add the reason text when it's actually a meaningful swing
      // (skip noisy ~1pp moves that would clutter the reasons list).
      if (normalized >= 0.2) {
        reasons.push({
          kind: 'leverage',
          text: leverageText(wpa),
          weight: W_LEVERAGE * normalized,
        })
      }
    }

    // 3. Low coach grade — explicit signal from the coach that this round is
    //    a problem. Always full weight when present.
    if (r.coach_grade != null && r.coach_grade <= 2) {
      reasons.push({
        kind: 'low_grade',
        text: lowGradeText(r.coach_grade),
        weight: W_LOW_GRADE,
      })
    }

    // 4. Ungraded but high WP surprise — the rounds you HAVEN'T looked at yet
    //    that the model thinks were anomalous. The "you should look at this"
    //    signal. Mutually exclusive with low_grade (already graded).
    if (
      r.coach_grade == null &&
      wpSurprise >= WP_SURPRISE_THRESHOLD &&
      predicted01 != null
    ) {
      reasons.push({
        kind: 'ungraded_anomaly',
        text: ungradedAnomalyText(predicted01),
        weight: W_UNGRADED_ANOMALY,
      })
    }

    // 5. Clutch — meaningful 1v2+ clutches only (1v1s are mostly noise).
    const isMeaningfulClutch =
      r.clutch_type != null && /^1v[2-5]$/i.test(r.clutch_type)
    if (isMeaningfulClutch) {
      reasons.push({
        kind: 'clutch',
        text: clutchText(r.clutch_type!, r.clutch_player),
        weight: W_CLUTCH,
      })
    }

    // 6. Streak break — round that flipped a 3+ run.
    if (breaksStreak(sorted, i, STREAK_BREAK_LEN)) {
      reasons.push({
        kind: 'streak_break',
        text: streakBreakText(),
        weight: W_STREAK_BREAK,
      })
    }

    // 7. FD against us AND we lost the round — the entry-pattern problem.
    if (r.first_blood === 'them' && outcome === 'L') {
      reasons.push({
        kind: 'fd_loss',
        text: fdLossText(),
        weight: W_FD_LOSS,
      })
    }

    // 8. High-signal coach tags — bad_rotate, setup_failed, force_mistake,
    //    bad_economy. One reason aggregating up to 2 tags; weight scales
    //    linearly with tag count.
    const matchingTags = (r.coach_tags ?? []).filter((t) =>
      HIGH_SIGNAL_TAGS.has(t)
    )
    if (matchingTags.length > 0) {
      reasons.push({
        kind: 'tag_signal',
        text: tagSignalText(matchingTags),
        weight: W_TAG_PER * matchingTags.length,
      })
    }

    // No reasons → nothing to surface for this round.
    if (reasons.length === 0) continue

    const score = clamp01(reasons.reduce((s, r) => s + r.weight, 0))

    // Sort reasons by weight desc so the UI can show the top 2-3 easily.
    reasons.sort((a, b) => b.weight - a.weight)

    items.push({
      roundNum: r.round_num,
      score,
      outcome,
      side: pickSide(r.side),
      roundType: r.round_type,
      scoreAtStart: scoreAtStart(sorted, i),
      reasons,
      coachGrade: r.coach_grade,
      coachTags: r.coach_tags ?? [],
      hasClutch: isMeaningfulClutch,
      clutchType: r.clutch_type,
      clutchPlayer: r.clutch_player,
      wpPredicted: predicted01 != null ? Math.round(predicted01 * 1000) / 10 : 0,
      wpSurprise,
      wpa,
    })
  }

  items.sort((a, b) => b.score - a.score)
  return items.slice(0, topN)
}

// ── Cross-match queue (dashboard) ────────────────────────────────────────────

export type DashboardReviewItem = ReviewItem & {
  matchIdHelldock: string
  matchDate: string
  opponentName: string | null
  mapName: string | null
  result: 'W' | 'L' | null
}

/**
 * Aggregate review-queue across multiple matches (e.g. last 3). Each input
 * row is one match plus its rounds. Returns the top N items globally,
 * sorted by composite score.
 *
 * Use case: dashboard "Review Queue" card that says "across your last 3
 * matches, here are the 5 rounds worth looking at."
 */
export function computeCrossMatchReviewQueue(input: {
  matches: Array<{
    match_id_helldock: string
    match_date: string
    opponent_name: string | null
    map_name: string | null
    result: string | null
    rounds: ReviewQueueRound[]
  }>
  wpWeights: WPWeights | null
  topN?: number
  perMatchCap?: number // cap items per match before global sort, default 3
}): DashboardReviewItem[] {
  const topN = input.topN ?? 5
  const perMatchCap = input.perMatchCap ?? 3

  const all: DashboardReviewItem[] = []
  for (const m of input.matches) {
    const items = computeReviewQueue({
      rounds: m.rounds,
      wpWeights: input.wpWeights,
      topN: perMatchCap,
    })
    for (const it of items) {
      all.push({
        ...it,
        matchIdHelldock: m.match_id_helldock,
        matchDate: m.match_date,
        opponentName: m.opponent_name,
        mapName: m.map_name,
        result:
          m.result === 'W' || m.result === 'L' ? (m.result as 'W' | 'L') : null,
      })
    }
  }

  all.sort((a, b) => b.score - a.score)
  return all.slice(0, topN)
}

// ── Discord-side formatter ───────────────────────────────────────────────────

/**
 * Format the top items as a short Discord field. One line per item, padded
 * for monospace alignment. Keeps under Discord's 1024-char-per-field cap
 * (we cap inputs at 3 so always well under).
 */
export function formatReviewQueueForDiscord(items: ReviewItem[]): string {
  if (!items.length) return ''
  return items
    .map((it) => {
      const sideShort =
        it.side === 'Attack' ? 'ATT' : it.side === 'Defense' ? 'DEF' : '—'
      const top = it.reasons[0]?.text ?? '—'
      const grade = it.coachGrade != null ? `g${it.coachGrade}` : 'ungr'
      return `R${String(it.roundNum).padStart(2, ' ')} ${sideShort} · ${it.outcome} · ${grade} · ${top}`
    })
    .join('\n')
}

