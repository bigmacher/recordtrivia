import type { Trivia, WikiNote } from '../types'

// Open Trivia DB, category 12 is "Entertainment: Music"; url3986 keeps the text decodable.
export const OPEN_TDB_URL = 'https://opentdb.com/api.php?amount=50&category=12&encode=url3986'

type OpenTdbQuestion = {
  type?: string
  question?: string
  correct_answer?: string
  incorrect_answers?: string[]
}

export type OpenTdbResponse = { response_code?: number; results?: OpenTdbQuestion[] }

function decode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function cardsFromOpenTdb(body: OpenTdbResponse): Trivia[] {
  if (body.response_code !== 0) return []
  const out: Trivia[] = []
  for (const q of body.results ?? []) {
    if (!q.question || !q.correct_answer) continue
    const question = decode(q.question)
    const answer = decode(q.correct_answer)
    const wrong = (q.incorrect_answers ?? []).map(decode)
    // Put the right answer in a stable but unpredictable slot.
    const choices = q.type === 'boolean' ? ['True', 'False'] : [...wrong]
    if (q.type !== 'boolean') choices.splice(hash(question) % (wrong.length + 1), 0, answer)
    out.push({ album: 'Music trivia', artist: 'Open Trivia DB', question, answer, choices, source: 'web' })
  }
  return out
}

export function wikiKey(card: Trivia): string {
  return `${card.album}|${card.artist}`.toLowerCase()
}

// Wikipedia names album pages "Title (Artist album)", "Title (album)" or just "Title".
export function wikiCandidates(card: Trivia): string[] {
  const title = card.album.trim()
  const titles = [`${title} (${card.artist} album)`, `${title} (album)`, title]
  return titles.map(t => t.replace(/ /g, '_'))
}

export type WikiSummary = {
  type?: string
  extract?: string
  content_urls?: { desktop?: { page?: string } }
}

function firstSentences(text: string, max = 260): string {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text]
  let out = ''
  for (const s of sentences) {
    if ((out + s).length > max && out) break
    out += s
  }
  return out.trim()
}

// Takes a summary only when it is an album page about the right artist.
export function noteFromSummary(card: Trivia, summary: WikiSummary): WikiNote | undefined {
  const extract = summary.extract ?? ''
  const url = summary.content_urls?.desktop?.page
  if (summary.type !== 'standard' || !url) return undefined
  const lower = extract.toLowerCase()
  const artistWord = card.artist.toLowerCase().replace(/^the\s+/, '').split(/\s+/)[0] ?? ''
  if (!/\balbum\b|\bep\b|\bsingle\b|\bsoundtrack\b/.test(lower)) return undefined
  if (artistWord && !lower.includes(artistWord)) return undefined

  return { extract: firstSentences(extract), url }
}
