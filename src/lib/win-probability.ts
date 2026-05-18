// Pre-round win-probability model. Logistic regression trained on historical
// rounds in the active team's match list. Features are derived per round from
// the score state going INTO the round + the side + economy + round number +
// pistol flag. Output is a 0–100 probability that the team will win the round.
//
// Trained server-side on every analytics page load. ~250k row updates per train
// at our current data size (≈500 rounds × 500 epochs) — sub-50ms. If the
// dataset grows past ~5k rounds we should memoize by a hash of the row outcomes.

// ── Public types ─────────────────────────────────────────────────────────────

export type WPRound = {
  match_id: string
  round_num: number
  side: string | null      // 'Attack' | 'Defense'
  outcome: string | null   // 'W' | 'L' | null
  round_type: string | null
  our_econ: number | null
  their_econ: number | null
}

export type WPFeatures = {
  scoreDiff: number    // (our wins − their wins) going INTO this round
  side: number         // +1 ATT, −1 DEF, 0 unknown
  econLogRatio: number // log((our + 500) / (their + 500)) — smoothed
  roundNum: number     // 1-based round index
  isPistol: number     // 0 or 1
}

export type WPWeights = {
  bias: number
  scoreDiff: number
  side: number
  econLogRatio: number
  roundNum: number
  isPistol: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function extractFeatures(
  r: WPRound,
  scoreDiffPreRound: number
): WPFeatures {
  const sideVal =
    r.side === 'Attack' ? 1 : r.side === 'Defense' ? -1 : 0
  const ourE = r.our_econ ?? 0
  const theirE = r.their_econ ?? 0
  const econLogRatio = Math.log((ourE + 500) / (theirE + 500))
  return {
    scoreDiff: scoreDiffPreRound,
    side: sideVal,
    econLogRatio,
    roundNum: r.round_num,
    isPistol: r.round_type === 'Pistol' ? 1 : 0,
  }
}

function sigmoid(z: number): number {
  if (z > 30) return 1
  if (z < -30) return 0
  return 1 / (1 + Math.exp(-z))
}

function score(w: WPWeights, f: WPFeatures): number {
  return (
    w.bias +
    w.scoreDiff * f.scoreDiff +
    w.side * f.side +
    w.econLogRatio * f.econLogRatio +
    w.roundNum * f.roundNum +
    w.isPistol * f.isPistol
  )
}

/** Build per-round features + binary outcomes from a flat round list. */
function buildTrainingData(
  rounds: WPRound[]
): { features: WPFeatures; outcome: 0 | 1 }[] {
  const byMatch: Record<string, WPRound[]> = {}
  for (const r of rounds) {
    byMatch[r.match_id] = byMatch[r.match_id] ?? []
    byMatch[r.match_id].push(r)
  }
  const out: { features: WPFeatures; outcome: 0 | 1 }[] = []
  for (const matchId of Object.keys(byMatch)) {
    const ms = byMatch[matchId].slice().sort((a, b) => a.round_num - b.round_num)
    let ourWins = 0
    let theirWins = 0
    for (const r of ms) {
      if (r.outcome !== 'W' && r.outcome !== 'L') continue
      const f = extractFeatures(r, ourWins - theirWins)
      out.push({ features: f, outcome: r.outcome === 'W' ? 1 : 0 })
      if (r.outcome === 'W') ourWins++
      else theirWins++
    }
  }
  return out
}

// ── Train ────────────────────────────────────────────────────────────────────

/**
 * Train a logistic regression model. Returns null when there's not enough
 * data (need at least 30 W/L rounds). Online SGD with L2 regularization;
 * coefficients converge quickly at our data size.
 */
export function trainWinProbability(
  rounds: WPRound[],
  opts?: { epochs?: number; lr?: number; l2?: number }
): { weights: WPWeights; trainSize: number; meanY: number } | null {
  const epochs = opts?.epochs ?? 400
  const lrBase = opts?.lr ?? 0.05
  const l2 = opts?.l2 ?? 0.005

  const data = buildTrainingData(rounds)
  if (data.length < 30) return null

  const meanY = data.reduce((s, d) => s + d.outcome, 0) / data.length
  // Initialize bias to logit of base rate so the model starts calibrated.
  const initialBias = Math.log(meanY / Math.max(1 - meanY, 1e-6))

  const w: WPWeights = {
    bias: initialBias,
    scoreDiff: 0,
    side: 0,
    econLogRatio: 0,
    roundNum: 0,
    isPistol: 0,
  }

  for (let epoch = 0; epoch < epochs; epoch++) {
    // Decay learning rate slightly per epoch for stability
    const lr = lrBase / (1 + epoch / 200)
    for (const { features, outcome } of data) {
      const z = score(w, features)
      const yhat = sigmoid(z)
      const err = yhat - outcome
      // Gradient step + L2 regularization on the weights (not the bias)
      w.bias -= lr * err
      w.scoreDiff -= lr * (err * features.scoreDiff + l2 * w.scoreDiff)
      w.side -= lr * (err * features.side + l2 * w.side)
      w.econLogRatio -=
        lr * (err * features.econLogRatio + l2 * w.econLogRatio)
      w.roundNum -= lr * (err * features.roundNum + l2 * w.roundNum)
      w.isPistol -= lr * (err * features.isPistol + l2 * w.isPistol)
    }
  }

  return { weights: w, trainSize: data.length, meanY }
}

// ── Predict ──────────────────────────────────────────────────────────────────

/** Returns P(W) as a 0–100 number with 1 decimal. */
export function predictWinProbability(
  weights: WPWeights,
  features: WPFeatures
): number {
  return Math.round(sigmoid(score(weights, features)) * 1000) / 10
}

/**
 * Build the pre-round WP for every round of a single match. Walks the match
 * in order and computes scoreDiff just from earlier-round outcomes. Useful
 * for the WP curve on match detail.
 */
export function computeMatchWinProbabilities(
  weights: WPWeights,
  matchRounds: WPRound[]
): { round_num: number; wpPct: number; outcome: string | null }[] {
  const sorted = matchRounds.slice().sort((a, b) => a.round_num - b.round_num)
  const out: { round_num: number; wpPct: number; outcome: string | null }[] = []
  let ourWins = 0
  let theirWins = 0
  for (const r of sorted) {
    const f = extractFeatures(r, ourWins - theirWins)
    const wp = predictWinProbability(weights, f)
    out.push({ round_num: r.round_num, wpPct: wp, outcome: r.outcome })
    if (r.outcome === 'W') ourWins++
    else if (r.outcome === 'L') theirWins++
  }
  return out
}

/**
 * Calibration check: bucket predictions into deciles, return mean predicted
 * P(W) vs actual W rate per bucket. Useful for debugging / a future debug
 * view, not surfaced in the UI by default.
 */
export function calibrationReport(
  weights: WPWeights,
  rounds: WPRound[]
): { bucket: number; n: number; meanPredicted: number; actualWinPct: number }[] {
  const data = buildTrainingData(rounds)
  type Bucket = { sumPred: number; wins: number; n: number }
  const buckets: Record<number, Bucket> = {}
  for (let i = 0; i < 10; i++) buckets[i] = { sumPred: 0, wins: 0, n: 0 }
  for (const { features, outcome } of data) {
    const p = sigmoid(score(weights, features))
    const b = Math.min(9, Math.floor(p * 10))
    buckets[b].sumPred += p
    buckets[b].wins += outcome
    buckets[b].n++
  }
  return Object.keys(buckets)
    .map(Number)
    .filter((b) => buckets[b].n > 0)
    .map((b) => ({
      bucket: b,
      n: buckets[b].n,
      meanPredicted: Math.round((buckets[b].sumPred / buckets[b].n) * 1000) / 10,
      actualWinPct: Math.round((buckets[b].wins / buckets[b].n) * 1000) / 10,
    }))
}
