// Helpers for the availability-poll feature. Pure — no DB, no React.

export type PollSlot = {
  at: Date           // start of the slot (UTC under the hood, displayed local)
  iso: string        // ISO key — round-tripped through API responses
  dateKey: string    // yyyy-mm-dd (local) — used to bucket slots into columns
  timeOfDay: string  // HH:mm (local) — used as row label
}

/** Cryptographically random URL-safe token. Used for the public share link. */
export function generatePollToken(): string {
  // 16 bytes → 22-char base64url
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  // btoa exists in Node 18+ and the browser.
  const b64 = typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Expand a poll window into discrete slots. Half-open: start inclusive, end exclusive. */
export function buildPollSlots(
  startAtIso: string,
  endAtIso: string,
  slotMinutes: number
): PollSlot[] {
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)
  const step = slotMinutes * 60_000
  const out: PollSlot[] = []
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    const d = new Date(t)
    out.push({
      at: d,
      iso: d.toISOString(),
      dateKey: localDateKey(d),
      timeOfDay: localTimeOfDay(d),
    })
  }
  return out
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export function localTimeOfDay(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Group slots into columns by dateKey, preserving order. */
export function groupSlotsByDate(slots: PollSlot[]): {
  dateKey: string
  label: string // friendly day label
  slots: PollSlot[]
}[] {
  const byKey: Record<string, PollSlot[]> = {}
  const order: string[] = []
  for (const s of slots) {
    if (!byKey[s.dateKey]) {
      byKey[s.dateKey] = []
      order.push(s.dateKey)
    }
    byKey[s.dateKey].push(s)
  }
  return order.map((key) => ({
    dateKey: key,
    label: dayLabel(new Date(byKey[key][0].at)),
    slots: byKey[key],
  }))
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  })
}

export type SlotCount = {
  iso: string
  count: number
}

/** Bucket a flat list of responses by slot_at → count. */
export function tallyResponses(
  responses: { slot_at: string }[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of responses) {
    out[r.slot_at] = (out[r.slot_at] ?? 0) + 1
  }
  return out
}

/** All distinct respondents across a response list, sorted alphabetically. */
export function listRespondents(
  responses: { respondent_name: string }[]
): string[] {
  const set = new Set<string>()
  for (const r of responses) set.add(r.respondent_name)
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

/** Build a name × slot grid for the per-respondent breakdown. */
export function buildRespondentGrid(
  responses: { respondent_name: string; slot_at: string }[],
  slots: PollSlot[]
): { name: string; available: Record<string, boolean> }[] {
  const names = listRespondents(responses)
  const slotKeys = new Set(slots.map((s) => s.iso))
  return names.map((name) => {
    const available: Record<string, boolean> = {}
    for (const r of responses) {
      if (r.respondent_name !== name) continue
      if (!slotKeys.has(r.slot_at)) continue
      available[r.slot_at] = true
    }
    return { name, available }
  })
}
