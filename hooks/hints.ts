import type { Trivia } from '../types'

export const MAX_HINTS = 2

// Hint n (1 or 2) for a card, each giving away a little more; undefined when the card has none.
export function hintFor(card: Trivia, n: number): string | undefined {
  const answer = card.answer
  if (!answer || n < 1 || n > MAX_HINTS) return undefined

  // True or false: a hint would be the answer.
  if (card.choices?.length === 2) return undefined

  // Multiple choice: the first hint takes away two wrong options.
  if (card.choices) {
    if (n > 1) return undefined
    const wrong = card.choices.filter(c => c !== answer)
    const kept = wrong[answer.length % wrong.length]
    const left = card.choices.filter(c => c === answer || c === kept)
    return `50/50: it's one of ${left.map(c => `"${c}"`).join(' or ')}.`
  }

  if (card.kind === 'tune' && n === 1 && card.artist) return `It's by ${card.artist}.`

  const number = Number(answer.replace(/,/g, ''))
  if (/^[\d,]+$/.test(answer) && Number.isFinite(number)) {
    if (number > 1900 && number < 2100 && !answer.includes(',')) {
      return n === 1 ? `It's in the ${Math.floor(number / 10) * 10}s.` : `It ends in ${String(number).slice(-1)}.`
    }
    const span = Math.max(2, Math.round(number * (n === 1 ? 0.5 : 0.2)))
    return `It's between ${(Math.max(0, number - span)).toLocaleString('en-US')} and ${(number + span).toLocaleString('en-US')}.`
  }

  const words = answer.split(/\s+/)
  if (n === 1) {
    const count = words.length === 1 ? 'one word' : `${words.length} words`
    return `${count}, starting with "${answer[0]!.toUpperCase()}".`
  }
  // Second hint: the first letter of each word, the rest as blanks.
  return words.map(w => w.replace(/^(\W*\w)(.*)$/, (_, first: string, rest: string) => first + rest.replace(/\w/g, '_'))).join(' ')
}
