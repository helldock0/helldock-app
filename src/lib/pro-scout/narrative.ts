/**
 * AI scout-memo generation via Google AI Studio (Gemma family by default).
 *
 * Architecture:
 *   - generateNarrative() takes a dossier, prompts the model, returns markdown.
 *   - getOrGenerateNarrative() checks pro_scout_narratives cache first; only
 *     calls the model when missing or expired.
 *   - The deployed page just reads from cache — generation runs locally via
 *     scripts/gen-narratives.mts. No API key required in production.
 *
 * Env:
 *   GOOGLE_AI_API_KEY   API key from Google AI Studio
 *   GOOGLE_AI_MODEL     model name (default: 'gemma-3-1b-it')
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProTeamDossier } from './types'

const DEFAULT_MODEL = 'gemma-3-1b-it'
const PROMPT_VERSION = 'v1'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

// ─── Prompt construction ─────────────────────────────────────────────────────

/** Reduce the dossier to a compact summary that fits in a 1B model's context window. */
function buildDossierSummary(d: ProTeamDossier): string {
  const cleanName = (s: string) => {
    const m = s.match(/^.+\s*\(([^)]+)\)\s*$/)
    return m ? m[1].trim() : s.trim()
  }

  const lines: string[] = []
  lines.push(`TEAM: ${cleanName(d.team.name)} (region: ${d.team.region})`)
  lines.push(`SCOPE: ${d.scope.label} | ${d.scope.matchCount} matches`)
  lines.push('')

  lines.push('FORM:')
  lines.push(
    `  Series: ${d.form.seriesWins}-${d.form.seriesLosses} (${d.form.seriesWinPct ?? '—'}%)`
  )
  lines.push(
    `  Maps: ${d.form.mapWins}-${d.form.mapLosses} (${d.form.mapWinPct ?? '—'}%)`
  )
  lines.push(`  Recent (last 5): ${d.form.recentForm}`)
  if (d.form.trendDelta != null)
    lines.push(
      `  Trend: ${d.form.trendDelta > 0 ? '+' : ''}${d.form.trendDelta}pp (recent half vs older half)`
    )
  lines.push('')

  lines.push('MAP POOL:')
  for (const m of d.maps) {
    lines.push(
      `  ${m.mapName}: n=${m.played} W%=${m.winPct ?? '—'} pick=${m.picked} opp=${m.pickedByOpp} dec=${m.decider} atk=${m.atkWinPct ?? '—'}%/def=${m.defWinPct ?? '—'}% | agents: ${m.topAgents.slice(0, 5).map((a) => `${a.agent}×${a.count}`).join(', ')}`
    )
  }
  lines.push('')

  lines.push('ROSTER (with league-baseline ACS context):')
  for (const p of d.roster) {
    const baseline = d.roleBaselines.find((b) => b.role === p.primaryRole)
    const cmp =
      baseline?.acsP50 != null && p.avgAcs != null
        ? `(role p50=${baseline.acsP50.toFixed(0)}, p75=${baseline.acsP75?.toFixed(0)})`
        : ''
    lines.push(
      `  ${p.ign} | ${p.primaryRole ?? '—'} | ACS=${p.avgAcs ?? '—'} K/D/A=${p.avgK}/${p.avgD}/${p.avgA} +/-=${p.avgPlusMinus} | sig: ${p.signatureAgent?.agent ?? '—'}×${p.signatureAgent?.count ?? 0} | n=${p.maps} maps ${cmp}`
    )
  }
  lines.push('')

  lines.push('TOP COMPS:')
  for (const c of d.topComps.slice(0, 6)) {
    lines.push(
      `  [${c.archetype}] ${c.agents.join('/')} on ${c.maps.join(',')} — ${c.wins}-${c.played - c.wins} (${c.winPct ?? '—'}%)`
    )
  }
  lines.push('')

  lines.push('TACTICAL PATTERNS:')
  lines.push(
    `  Pistol W%=${d.tactics.pistolWinPct ?? '—'}% (${d.tactics.pistolWins}/${d.tactics.pistolPlayed})`
  )
  lines.push(
    `  Bonus-round W%=${d.tactics.bonusRoundWinPct ?? '—'}% (R2+R14)`
  )
  lines.push(
    `  Plant rate on ATK: ${d.tactics.plantRateAtk ?? '—'}% over ${d.tactics.plantAtkN} atk rounds`
  )
  lines.push(
    `  Closeout when leading 1H: ${d.tactics.closeoutRate ?? '—'}%`
  )
  lines.push(
    `  Comeback when trailing 1H: ${d.tactics.comebackRate ?? '—'}%`
  )
  lines.push(`  OT record: ${d.tactics.otWins}/${d.tactics.otPlayed} maps`)
  lines.push('')

  lines.push('RECENT MATCHES (most recent first):')
  for (const m of d.recentMatches.slice(0, 8)) {
    lines.push(
      `  ${m.date} ${m.result} ${m.teamScore}-${m.oppScore} vs ${cleanName(m.opponentName)} (${m.eventStage ?? '—'})`
    )
  }

  return lines.join('\n')
}

function buildCoachMemoPrompt(d: ProTeamDossier): string {
  const teamName = (d.team.name.match(/^.+\s*\(([^)]+)\)\s*$/) || [, d.team.name])[1]
  return `You are an experienced VALORANT esports analyst writing a pre-match scout report for the head coach of Wuxi TEC (VCT CN team). The audience is a coaching staff preparing for a match against ${teamName}.

Below is structured data from their recent competitive play. Turn this into a tight, tactical scout memo (300-450 words) the head coach can read 10 minutes before a strategy meeting.

OUTPUT FORMAT (markdown, exactly these sections in this order):

## Form
One sentence on their trajectory. Lead with the headline.

## Veto Strategy
Bullet list: which maps to BAN, which to PICK, and which is the likely DECIDER. Cite their win % on each map. Be specific.

## Roster Read
- Identify the **CARRY** by IGN with their best agent and ACS context vs role baseline.
- Identify the **WEAK LINK** by IGN with what makes them exploitable.
- Note the IGL/anchor if the role distribution implies one.

## Tactical Fingerprint
2-3 sentences on their play STYLE: front-runner or comeback team, plant-heavy or pick-driven, side preference, OT mentality.

## Action Items
3-5 bullet points the head coach should communicate to players pre-match. Concrete and tactical (not motivational).

RULES:
- Use IGNs verbatim from the data.
- Quote percentages directly from the data.
- Coach voice: terse, declarative, no hedging, no fluff.
- Do not invent stats or players not in the data.
- Do not include preamble like "Here is the memo:" — start directly with "## Form".

DATA:
\`\`\`
${buildDossierSummary(d)}
\`\`\``
}

// ─── Google AI Studio client ─────────────────────────────────────────────────

async function callGoogleAI(
  prompt: string,
  model: string,
  apiKey: string,
  attempt = 1
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`
  const isGemma = /gemma/i.test(model)
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  }
  if (!isGemma) {
    body.generationConfig = { temperature: 0.3, maxOutputTokens: 1500, topP: 0.95 }
  } else {
    body.generationConfig = { maxOutputTokens: 1200 }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500)
      console.error(`Google AI ${res.status} (attempt ${attempt}):`, text)
      // Retry on 5xx and 429 up to 3 attempts with exponential backoff
      if ((res.status >= 500 || res.status === 429) && attempt < 3) {
        const delayMs = attempt * 5000
        await new Promise((r) => setTimeout(r, delayMs))
        return callGoogleAI(prompt, model, apiKey, attempt + 1)
      }
      return null
    }
    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text: string }) => p.text).join('') ?? null
    if (!text) {
      console.error('Google AI: empty response', JSON.stringify(data).slice(0, 500))
    }
    return text
  } catch (err) {
    console.error('Google AI fetch error:', err)
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 5000))
      return callGoogleAI(prompt, model, apiKey, attempt + 1)
    }
    return null
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Strip Gemma/Gemini "thinking" / preamble before the structured memo.
 *
 * Gemma emits a long reasoning trace that often includes the literal section
 * headers (`## Form, ## Veto Strategy, ...` listed as planning notes) BEFORE
 * the actual final memo. We want the structurally-complete memo, which is the
 * LAST `## Form` block followed by all five expected sections in order.
 */
export function stripPreamble(s: string): string {
  const REQUIRED = [
    '## Form',
    '## Veto Strategy',
    '## Roster Read',
    '## Tactical Fingerprint',
    '## Action Items',
  ]
  // Find all positions of "## Form" — pick the LAST one whose tail also
  // contains all other required headers in order. That's the final memo.
  const forms: number[] = []
  let idx = -1
  while ((idx = s.indexOf('## Form', idx + 1)) !== -1) forms.push(idx)

  for (let i = forms.length - 1; i >= 0; i--) {
    const tail = s.slice(forms[i])
    let cursor = 0
    let ok = true
    for (const h of REQUIRED) {
      const next = tail.indexOf(h, cursor)
      if (next < 0) {
        ok = false
        break
      }
      cursor = next + h.length
    }
    if (ok) return tail.trim()
  }

  // Fallback: last "## Form" anywhere
  if (forms.length) return s.slice(forms[forms.length - 1]).trim()
  // Last fallback: any leading `##` header
  const m = s.match(/##\s+\w+/)
  if (m && m.index !== undefined) return s.slice(m.index).trim()
  return s.trim()
}

export async function generateNarrative(d: ProTeamDossier): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY
  if (!apiKey) {
    console.error('GOOGLE_AI_API_KEY not set')
    return null
  }
  const model = process.env.GOOGLE_AI_MODEL ?? DEFAULT_MODEL
  const prompt = buildCoachMemoPrompt(d)
  const raw = await callGoogleAI(prompt, model, apiKey)
  if (!raw) return null
  return stripPreamble(raw)
}

export type CachedNarrative = {
  content: string
  generatedAt: string
  model: string | null
  fromCache: boolean
}

/** Read-only cache lookup — safe for anon Supabase clients on the public page. */
export async function readCachedNarrative(
  sb: SupabaseClient,
  teamId: string,
  scopeLabel: string
): Promise<CachedNarrative | null> {
  const { data } = await sb
    .from('pro_scout_narratives')
    .select('content_md, model, generated_at')
    .eq('team_id', teamId)
    .eq('scope_label', scopeLabel)
    .eq('prompt_version', PROMPT_VERSION)
    .maybeSingle()
  if (!data?.content_md) return null
  return {
    content: data.content_md,
    generatedAt: data.generated_at,
    model: data.model,
    fromCache: true,
  }
}

/**
 * Generate + cache. Requires an admin Supabase client (anon can't insert).
 * Use this from scripts/gen-narratives.mts, not from server pages.
 */
export async function generateAndCacheNarrative(
  sbAdmin: SupabaseClient,
  dossier: ProTeamDossier
): Promise<CachedNarrative | null> {
  // Try cache first
  const existing = await readCachedNarrative(sbAdmin, dossier.team.id, dossier.scope.label)
  if (existing) {
    const age = Date.now() - new Date(existing.generatedAt).getTime()
    if (age < CACHE_TTL_MS) return existing
  }

  const content = await generateNarrative(dossier)
  if (!content) return existing ?? null

  const model = process.env.GOOGLE_AI_MODEL ?? DEFAULT_MODEL
  const { error } = await sbAdmin.from('pro_scout_narratives').upsert(
    {
      team_id: dossier.team.id,
      scope_label: dossier.scope.label,
      content_md: content,
      model,
      prompt_version: PROMPT_VERSION,
      generated_at: new Date().toISOString(),
    },
    { onConflict: 'team_id,scope_label,prompt_version' }
  )
  if (error) {
    console.error('cache write error:', error.message)
  }

  return {
    content,
    generatedAt: new Date().toISOString(),
    model,
    fromCache: false,
  }
}

// ─── Minimal markdown → plain HTML (for embedding without a markdown lib) ───

/**
 * Very small markdown renderer for the memo output. Supports:
 *   - `## Heading` and `### Heading`
 *   - `**bold**` inline
 *   - `- bullet` lines (single-level)
 *   - blank-line paragraph separation
 *
 * Returns a sanitized HTML string. We control the input (LLM output we
 * generated locally), but still escape angle brackets defensively.
 */
export function memoToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const lines = md.split(/\r?\n/)
  const out: string[] = []
  let inList = false

  const flushList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  const inlineFmt = (s: string) =>
    esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(
      /`([^`]+)`/g,
      '<code class="font-mono text-gold/90 bg-surface px-1 rounded">$1</code>'
    )

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushList()
      continue
    }
    if (line.startsWith('### ')) {
      flushList()
      out.push(`<h3 class="text-sm font-semibold text-gold uppercase tracking-wider mt-4 mb-2">${inlineFmt(line.slice(4))}</h3>`)
    } else if (line.startsWith('## ')) {
      flushList()
      out.push(`<h2 class="text-base font-semibold text-fg mt-5 mb-2">${inlineFmt(line.slice(3))}</h2>`)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) {
        out.push('<ul class="space-y-1.5 mb-3 text-sm">')
        inList = true
      }
      out.push(`<li class="flex gap-2"><span class="text-gold mt-0.5">▸</span><span>${inlineFmt(line.slice(2))}</span></li>`)
    } else {
      flushList()
      out.push(`<p class="text-sm text-fg/90 leading-relaxed mb-2">${inlineFmt(line)}</p>`)
    }
  }
  flushList()
  return out.join('\n')
}
