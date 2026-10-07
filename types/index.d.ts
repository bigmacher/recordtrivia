export type Trivia = {
  album: string
  artist: string
  year?: number
  fact?: string
  question?: string
  answer?: string
  choices?: string[]
  // Wrong answers that let the card play as multiple choice.
  wrong?: string[]
  // What the question asks about (year, label, style, added, track, count, have).
  kind?: string
  // The question is about the year, so it stays hidden until the answer.
  isYearHidden?: boolean
  // The cover would give the answer away (Name That Tune), so it waits for the answer.
  isCoverHidden?: boolean
  // The album and artist would give the answer away, so the card's heading waits for the answer.
  isHeaderHidden?: boolean
  // Genres and styles, for /trivia <genre>.
  genres?: string[]
  source: 'deck' | 'discogs' | 'web' | 'apple'
  releaseId?: number
  url?: string
  coverUrl?: string
  coverThumbUrl?: string
  isEnriched?: boolean
}

export type Score = { points: number; right: number; close: number; wrong: number; streak: number }

export type WikiNote = { extract: string; url: string; imageUrl?: string }

declare module 'claude-code' {
  interface PluginState {
    'record-trivia': {
      index: number
      isRevealed: boolean
      bandIndex: number
      isBandRevealed: boolean
      fromDiscogs: Trivia[]
      fromWeb: Trivia[]
      fromApple: Trivia[]
      wiki: Record<string, WikiNote | null>
      covers: Record<string, string | null>
      discogsStatus: string
      awaiting: 'answer' | 'next' | 'none'
      score: Score
      hintsUsed: number
      filterText: string
      // The card open in the chat (a rotation card or a Name That Tune round), kept until the next card.
      current: Trivia | null
    }
  }
}
