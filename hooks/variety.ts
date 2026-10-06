import type { Trivia } from '../types'

export function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

function shuffled<T>(items: T[], seed: number): T[] {
  return items
    .map((item, i) => ({ item, key: hash(`${seed}:${i}`) }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.item)
}

const formatNumber = (n: number) => n.toLocaleString('en-US')

// Near misses for a numeric answer: years a few apart, counts a little off.
function numericWrong(answer: string, kind: string | undefined, seed: number): string[] {
  const n = Number(answer.replace(/,/g, ''))
  if (!Number.isFinite(n)) return []
  if (kind === 'year' || (n > 1900 && n < 2100 && !answer.includes(','))) {
    const offsets = shuffled([-4, -3, -2, -1, 1, 2, 3, 4], seed).slice(0, 3)
    return offsets.map(o => String(n + o))
  }
  if (kind === 'have') return [0.4, 0.7, 1.6].map(f => formatNumber(Math.max(1, Math.round(n * f))))
  const offsets = shuffled([-3, -2, -1, 1, 2, 3], seed).filter(o => n + o > 0).slice(0, 3)
  return offsets.map(o => String(n + o))
}

// Fills wrong answers for collection questions from the other records' answers to the same kind of question.
export function addDistractors(cards: Trivia[]): Trivia[] {
  const byKind = new Map<string, string[]>()
  for (const c of cards) {
    if (!c.kind || !c.answer || c.kind === 'year' || c.kind === 'count' || c.kind === 'have') continue
    const pool = byKind.get(c.kind) ?? []
    if (!pool.includes(c.answer)) pool.push(c.answer)
    byKind.set(c.kind, pool)
  }

  return cards.map(c => {
    if (c.wrong?.length || !c.kind || !c.answer) return c
    const pool = (byKind.get(c.kind) ?? []).filter(a => a !== c.answer)
    if (pool.length < 2) return c
    return { ...c, wrong: shuffled(pool, hash(c.answer)).slice(0, 3) }
  })
}

export type Format = 'typed' | 'choice' | 'truefalse'

// About 40% typed, 40% multiple choice, 20% true or false, each where the card allows it.
export function formatFor(card: Trivia, seed: number): Format {
  const r = seed % 10
  if (r >= 8 && card.year) return 'truefalse'
  if (r >= 4 && (card.wrong?.length || numericWrong(card.answer ?? '', card.kind, seed).length)) return 'choice'
  return 'typed'
}

// How a card plays this time round. The same card at the same place always plays the same way.
export function varyCard(card: Trivia, deck: Trivia[], position: number): Trivia {
  if (card.source === 'web' || !card.question || !card.answer || card.choices) return card
  const seed = hash(`${card.album}|${position}`)
  const format = formatFor(card, seed)

  if (format === 'choice') {
    const wrong = card.wrong?.length ? card.wrong : numericWrong(card.answer, card.kind, seed)
    const choices = shuffled([card.answer, ...wrong.slice(0, 3)], seed)
    return { ...card, choices }
  }

  if (format === 'truefalse' && card.year) {
    const isTrue = seed % 2 === 0
    const otherArtists = deck.map(c => c.artist).filter(a => a && a !== card.artist && !/trivia/i.test(a))
    const aboutArtist = (seed >> 3) % 2 === 0 && otherArtists.length > 0
    if (aboutArtist) {
      const shown = isTrue ? card.artist : otherArtists[seed % otherArtists.length]!
      return {
        ...card,
        question: `True or false: "${card.album}" is by ${shown}.`,
        answer: isTrue ? 'True' : 'False',
        choices: ['True', 'False'],
        fact: [isTrue ? undefined : `It's by ${card.artist}.`, card.fact].filter(Boolean).join(' '),
      }
    }
    const offset = [-3, -2, -1, 1, 2, 3][seed % 6]!
    const year = isTrue ? card.year : card.year + offset
    return {
      ...card,
      question: `True or false: "${card.album}" by ${card.artist} came out in ${year}.`,
      isYearHidden: true,
      answer: isTrue ? 'True' : 'False',
      choices: ['True', 'False'],
      fact: [isTrue ? undefined : `It came out in ${card.year}.`, card.fact].filter(Boolean).join(' '),
    }
  }

  return card
}
