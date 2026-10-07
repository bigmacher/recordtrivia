import type { Trivia } from '../types'

export type Filter =
  | { kind: 'decade'; from: number; label: string }
  | { kind: 'genre'; key: string; label: string }

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

// "80s", "1980s", "'90s", "00s" → a decade; anything else of a word or two → a genre or style.
export function parseFilter(text: string): Filter | undefined {
  const t = text.trim().toLowerCase().replace(/[‘’']/g, '')
  if (!t) return undefined
  const decade = /^(19|20)?(\d)0s$/.exec(t)
  if (decade) {
    const digit = Number(decade[2])
    const century = decade[1] ? Number(decade[1]) * 100 : digit <= 2 ? 2000 : 1900
    const from = century + digit * 10
    return { kind: 'decade', from, label: `${from}s` }
  }
  if (t.split(/\s+/).length > 3) return undefined
  return { kind: 'genre', key: squash(t), label: text.trim() }
}

export function matchesFilter(card: Trivia, filter: Filter): boolean {
  if (filter.kind === 'decade') return !!card.year && card.year >= filter.from && card.year < filter.from + 10
  return (card.genres ?? []).some(g => {
    const genre = squash(g)
    return genre.includes(filter.key) || filter.key.includes(genre)
  })
}

export function describeFilter(filter: Filter): string {
  return filter.kind === 'decade' ? `albums from the ${filter.label}` : `${filter.label} albums`
}
