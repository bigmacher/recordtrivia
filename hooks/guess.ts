import type { Trivia } from '../types'

const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'his', 'her', 'their', 'on', 'in', 'to'])

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && !STOP.has(w))
    .join(' ')
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = cur
    }
  }
  return row[b.length]!
}

// Forgives a typo or two in longer words.
function closeEnough(guess: string, answer: string): boolean {
  if (guess === answer) return true
  const allowed = answer.length >= 9 ? 2 : answer.length >= 5 ? 1 : 0
  return distance(guess, answer) <= allowed
}

// "Hipgnosis (Storm Thorgerson)" accepts either name; "A / B" either side.
function acceptedAnswers(answer: string): string[] {
  const parts = [answer, ...answer.split(/[()/,]| or /)]
  return parts.map(normalize).filter(Boolean)
}

export function isRightGuess(card: Trivia, rawGuess: string): boolean {
  if (!card.answer) return false
  const trimmed = rawGuess.trim()

  // A true-or-false card takes yes/no and t/f too.
  if (card.choices?.length === 2 && card.choices.includes('True')) {
    if (/^(t|true|yes|y|yep|yeah|correct|right)[.!]*$/i.test(trimmed)) return card.answer === 'True'
    if (/^(f|false|no|n|nope|wrong)[.!]*$/i.test(trimmed)) return card.answer === 'False'
  }

  // A multiple-choice card takes its letter too.
  const letter = /^([a-d])[.)]?$/i.exec(trimmed)
  if (card.choices && letter) {
    const picked = card.choices[letter[1]!.toUpperCase().charCodeAt(0) - 65]
    return picked === card.answer
  }

  const guess = normalize(trimmed)
  if (!guess) return false
  const answerNumber = card.answer.replace(/,/g, '')
  if (/^\d+$/.test(answerNumber)) return guess.replace(/ /g, '') === answerNumber

  for (const answer of acceptedAnswers(card.answer)) {
    if (closeEnough(guess, answer)) return true
    // "McCartney" for "Paul McCartney": every guessed word is in the answer, one of them a real name.
    const answerWords = answer.split(' ')
    const guessWords = guess.split(' ')
    const matches = guessWords.every(g => answerWords.some(a => closeEnough(g, a)))
    if (matches && guessWords.some(g => g.length >= 4)) return true
  }
  return false
}
