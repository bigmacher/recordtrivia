import type { Trivia } from '../types'

export type DiscordMessage = { content?: string }

// Reads the two message formats people post in the trivia channel:
//   !trivia Album | Artist | Year | Fact
//   !q Question | Answer
export function parseMessage(content: string): Trivia | undefined {
  const text = content.trim()
  const fact = /^!trivia\s+(.+)$/is.exec(text)
  if (fact) {
    const [album, artist, year, ...rest] = (fact[1] ?? '').split('|').map(s => s.trim())
    if (!album || !artist) return undefined
    const yearNumber = Number(year)
    const isYear = Number.isInteger(yearNumber) && yearNumber > 1800
    const factText = (isYear ? rest : [year, ...rest]).filter(Boolean).join(' | ')
    return {
      album,
      artist,
      year: isYear ? yearNumber : undefined,
      fact: factText || undefined,
      source: 'discord',
    }
  }
  const quiz = /^!q\s+(.+)$/is.exec(text)
  if (quiz) {
    const [question, answer] = (quiz[1] ?? '').split('|').map(s => s.trim())
    if (!question || !answer) return undefined
    return { album: 'Discord pop quiz', artist: '', question, answer, source: 'discord' }
  }
  return undefined
}

export function parseMessages(messages: DiscordMessage[]): Trivia[] {
  const out: Trivia[] = []
  for (const message of messages) {
    const card = parseMessage(message.content ?? '')
    if (card) out.push(card)
  }
  return out
}
