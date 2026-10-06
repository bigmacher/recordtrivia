export type Trivia = {
  album: string
  artist: string
  year?: number
  fact?: string
  question?: string
  answer?: string
  source: 'deck' | 'discogs'
  releaseId?: number
  url?: string
  isEnriched?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'record-trivia': {
      index: number
      isRevealed: boolean
      fromDiscogs: Trivia[]
      discogsStatus: string
    }
  }
}
