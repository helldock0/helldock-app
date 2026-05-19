// Month-grid helpers for the /calendar page. Pure functions, locale-stable.
// Days are returned in the user's local timezone (the app is single-region;
// scheduled_at is stored in UTC and rendered as local).

export type YearMonth = { year: number; month: number } // month is 1-12

export function currentYearMonth(): YearMonth {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function parseYearMonth(s: string | undefined | null): YearMonth {
  if (!s) return currentYearMonth()
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return currentYearMonth()
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return currentYearMonth()
  return { year, month }
}

export function formatYearMonthParam(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, '0')}`
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  // JS Date arithmetic; safer than manual rollover.
  const d = new Date(ym.year, ym.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function monthName(ym: YearMonth): string {
  return new Date(ym.year, ym.month - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Returns the date range covering the month grid. We start from the Monday
 * of the week that contains the 1st (Mon=0). The grid is always 6 rows × 7
 * days = 42 cells so layout never reflows.
 */
export function monthGridRange(ym: YearMonth): { start: Date; end: Date } {
  const firstOfMonth = new Date(ym.year, ym.month - 1, 1)
  // JS getDay: 0=Sun..6=Sat. We want week starting Monday, so offset:
  const dow = firstOfMonth.getDay() // 0..6
  const offset = (dow + 6) % 7 // Mon=0 .. Sun=6
  const start = new Date(ym.year, ym.month - 1, 1 - offset)
  const end = new Date(start)
  end.setDate(start.getDate() + 42) // exclusive
  return { start, end }
}

/** Format a JS Date as yyyy-mm-dd in local time. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Build the 42-day grid for a given month. */
export function buildMonthDays(ym: YearMonth): Date[] {
  const { start } = monthGridRange(ym)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

/** Date key for a scheduled timestamptz string, in local tz. */
export function dateKeyFromTimestamp(iso: string): string {
  return localDateKey(new Date(iso))
}

/** Hour:min in local time, 24h. */
export function timeOfDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
