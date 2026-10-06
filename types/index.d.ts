export type Trivia = {
  album: string
  artist: string
  year?: number
  fact?: string
  question?: string
  answer?: string
  choices?: string[]
  source: 'deck' | 'discogs' | 'web'
  releaseId?: number
  url?: string
  isEnriched?: boolean
}

export type WikiNote = { extract: string; url: string }

declare module 'claude-code' {
  interface PluginState {
    'record-trivia': {
      index: number
      isRevealed: boolean
      fromDiscogs: Trivia[]
      fromWeb: Trivia[]
      wiki: Record<string, WikiNote | null>
      discogsStatus: string
    }
  }
}
