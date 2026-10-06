export type Trivia = {
  album: string
  artist: string
  year?: number
  fact?: string
  question?: string
  answer?: string
  source: 'deck' | 'discord'
}

declare module 'claude-code' {
  interface PluginState {
    'record-trivia': {
      index: number
      isRevealed: boolean
      fromDiscord: Trivia[]
      discordStatus: string
    }
  }
}
