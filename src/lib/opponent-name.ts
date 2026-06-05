export function cleanOpponentName(name: string | null | undefined): string | null {
  const cleaned = name?.trim().replace(/^vs\s+/i, '').replace(/\s+/g, ' ')
  return cleaned && cleaned.length > 0 ? cleaned : null
}

export function formatOpponentName(name: string | null | undefined): string {
  const cleaned = cleanOpponentName(name)
  return cleaned ? `vs ${cleaned}` : 'vs unknown'
}
