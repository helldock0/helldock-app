// Server component: renders the calibration health of the Win-Probability model.
// Trains on the same rounds the match-detail WP curve uses, then runs the
// debug-only `calibrationReport()` and turns it into a one-glance panel.
//
// The "verdict" is a heuristic on the decile buckets — if predictions match
// outcomes within ~5pp on average, the WP curve on /matches/[id] can be trusted.
// If they diverge, the curve is suggestive at best.

import type { WPRound, WPWeights } from '@/lib/win-probability'
import {
  trainWinProbability,
  calibrationReport,
  extractFeatures,
} from '@/lib/win-probability'

type Bucket = {
  bucket: number
  n: number
  meanPredicted: number
  actualWinPct: number
}

function bucketLabel(b: number): string {
  return `${b * 10}–${(b + 1) * 10}%`
}

function colorForDelta(delta: number): string {
  const abs = Math.abs(delta)
  if (abs <= 5) return 'text-win-green'
  if (abs <= 12) return 'text-gold'
  return 'text-crimson'
}

function computeLogLoss(
  weights: WPWeights,
  rounds: WPRound[]
): { logLoss: number; n: number } {
  let sum = 0
  let n = 0
  const byMatch: Record<string, WPRound[]> = {}
  for (const r of rounds) {
    byMatch[r.match_id] = byMatch[r.match_id] ?? []
    byMatch[r.match_id].push(r)
  }
  for (const matchId of Object.keys(byMatch)) {
    const ms = byMatch[matchId].slice().sort((a, b) => a.round_num - b.round_num)
    let ourWins = 0
    let theirWins = 0
    for (const r of ms) {
      if (r.outcome !== 'W' && r.outcome !== 'L') {
        continue
      }
      const f = extractFeatures(r, ourWins - theirWins)
      const z =
        weights.bias +
        weights.scoreDiff * f.scoreDiff +
        weights.side * f.side +
        weights.econLogRatio * f.econLogRatio +
        weights.roundNum * f.roundNum +
        weights.isPistol * f.isPistol
      const p = z > 30 ? 1 : z < -30 ? 0 : 1 / (1 + Math.exp(-z))
      const y = r.outcome === 'W' ? 1 : 0
      const eps = 1e-6
      const pClamped = Math.min(1 - eps, Math.max(eps, p))
      sum += -(y * Math.log(pClamped) + (1 - y) * Math.log(1 - pClamped))
      n++
      if (r.outcome === 'W') ourWins++
      else theirWins++
    }
  }
  return { logLoss: n === 0 ? NaN : sum / n, n }
}

function verdictFromBuckets(buckets: Bucket[]): { verdict: string; tone: 'good' | 'warn' | 'bad' } {
  if (buckets.length === 0) return { verdict: 'Insufficient data', tone: 'warn' }
  // Weighted mean |Δ| across buckets that have data.
  const totalN = buckets.reduce((s, b) => s + b.n, 0)
  const weightedAbsDelta =
    buckets.reduce((s, b) => s + Math.abs(b.meanPredicted - b.actualWinPct) * b.n, 0) / totalN

  // High-end overconfidence: in buckets ≥70%, is predicted consistently above actual?
  const highBuckets = buckets.filter((b) => b.bucket >= 7)
  const highOver =
    highBuckets.length > 0 &&
    highBuckets.every((b) => b.meanPredicted - b.actualWinPct > 8)

  // Low-end underconfidence: in buckets ≤2 (0–30%), is predicted consistently below actual?
  const lowBuckets = buckets.filter((b) => b.bucket <= 2)
  const lowUnder =
    lowBuckets.length > 0 &&
    lowBuckets.every((b) => b.actualWinPct - b.meanPredicted > 8)

  if (highOver) return { verdict: 'Overconfident in high-WP rounds', tone: 'bad' }
  if (lowUnder) return { verdict: 'Underconfident in low-WP rounds', tone: 'bad' }
  if (weightedAbsDelta <= 5) return { verdict: 'Well-calibrated', tone: 'good' }
  if (weightedAbsDelta <= 12) return { verdict: 'Acceptable — minor drift', tone: 'warn' }
  return { verdict: 'Calibration drift — retrain after rehydrate', tone: 'bad' }
}

export default function ModelHealthPanel({ rounds }: { rounds: WPRound[] }) {
  const trained = trainWinProbability(rounds)
  if (!trained) {
    return (
      <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-6">
        <div className="text-2xs uppercase tracking-[0.18em] text-muted-2 mb-2">
          Model health · win probability
        </div>
        <p className="text-sm text-muted">
          Need at least 30 W/L rounds with econ data before the WP model can train.
        </p>
      </section>
    )
  }

  const buckets = calibrationReport(trained.weights, rounds)
  const { logLoss, n: lossN } = computeLogLoss(trained.weights, rounds)
  const { verdict, tone } = verdictFromBuckets(buckets)

  const toneClass =
    tone === 'good'
      ? 'text-win-green'
      : tone === 'warn'
      ? 'text-gold'
      : 'text-crimson'

  return (
    <section className="bg-surface-2 border border-line-strong/40 rounded-2xl p-6">
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-muted-2">
            Model health · win probability
          </div>
          <h3 className={`text-xl font-bold mt-1 ${toneClass}`}>{verdict}</h3>
        </div>
        <div className="flex items-baseline gap-5 text-2xs uppercase tracking-wider text-muted-2">
          <span className="tnum">
            log-loss <span className="text-fg font-semibold">{logLoss.toFixed(3)}</span>
            <span className="ml-1 text-muted-2">/ n={lossN}</span>
          </span>
          <span className="tnum">
            train rows <span className="text-fg font-semibold">{trained.trainSize}</span>
          </span>
          <span className="tnum">
            base rate{' '}
            <span className="text-fg font-semibold">
              {Math.round(trained.meanY * 1000) / 10}%
            </span>
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-2xs uppercase tracking-[0.16em] text-muted-2 border-b border-line">
              <th className="text-left px-3 py-2 font-semibold">Bucket</th>
              <th className="text-right px-3 py-2 font-semibold">n</th>
              <th className="text-right px-3 py-2 font-semibold">Predicted</th>
              <th className="text-right px-3 py-2 font-semibold">Actual</th>
              <th className="text-right px-3 py-2 font-semibold">Δ (actual − predicted)</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => {
              const delta =
                Math.round((b.actualWinPct - b.meanPredicted) * 10) / 10
              return (
                <tr
                  key={b.bucket}
                  className={i !== buckets.length - 1 ? 'border-b border-line' : ''}
                >
                  <td className="px-3 py-2 text-fg">{bucketLabel(b.bucket)}</td>
                  <td className="px-3 py-2 text-right tnum text-muted">{b.n}</td>
                  <td className="px-3 py-2 text-right tnum text-fg">
                    {b.meanPredicted}%
                  </td>
                  <td className="px-3 py-2 text-right tnum text-fg">
                    {b.actualWinPct}%
                  </td>
                  <td
                    className={`px-3 py-2 text-right tnum font-semibold ${colorForDelta(delta)}`}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}pp
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-2xs text-muted-2 leading-relaxed">
        Each row groups rounds by the model&apos;s predicted P(W). A well-calibrated
        model has predicted ≈ actual in every row (Δ near 0). Large positive Δ
        in low buckets = the model gives up too early; large negative Δ in high
        buckets = the model overrates favored rounds. Run a fresh rehydrate
        after shipping new metric fields if drift creeps in.
      </p>
    </section>
  )
}
