import type { Trivia } from '../types'

export type ItunesSong = {
  trackName?: string
  artistName?: string
  collectionName?: string
  releaseDate?: string
  previewUrl?: string
  artworkUrl100?: string
}

export function itunesSearchUrl(term: string): string {
  return `https://itunes.apple.com/search?entity=song&limit=25&term=${encodeURIComponent(term)}`
}

// "Dreams (2004 Remaster)" → "Dreams"; "Rocks Off - Remastered" → "Rocks Off".
export function cleanTrackName(name: string): string {
  return name.replace(/\s*[([][^)\]]*(remaster|version|mono|stereo|live|edit|mix|demo)[^)\]]*[)\]]/gi, '').replace(/\s+-\s+.*(remaster|version|mono|stereo|live|edit|mix).*$/i, '').trim()
}

const firstWord = (artist: string) => artist.toLowerCase().replace(/^the\s+/, '').split(/\s+/)[0] ?? ''

// A Name That Tune card from search results, keeping only the album artist's own recordings.
export function tuneCard(songs: ItunesSong[], artist: string, seed: number): Trivia | undefined {
  const key = firstWord(artist)
  const fit = songs.filter(s =>
    s.previewUrl && s.trackName &&
    (s.artistName ?? '').toLowerCase().includes(key) &&
    !/karaoke|tribute|cover|made famous/i.test(`${s.artistName} ${s.collectionName} ${s.trackName}`),
  )
  const seen = new Set<string>()
  const unique = fit.filter(s => {
    const name = cleanTrackName(s.trackName!).toLowerCase()
    if (seen.has(name)) return false
    seen.add(name)
    return true
  })
  const song = unique[seed % Math.max(1, unique.length)]
  if (!song) return undefined
  const track = cleanTrackName(song.trackName!)
  const year = Number(song.releaseDate?.slice(0, 4)) || undefined

  return {
    album: '🎧 Name that tune',
    artist: song.artistName ?? artist,
    question: `Tap to listen, then name the song: ${song.previewUrl}`,
    answer: track,
    fact: `"${track}" by ${song.artistName}, from ${cleanTrackName(song.collectionName ?? '')}${year ? ` (${year})` : ''}.`,
    coverUrl: song.artworkUrl100?.replace('100x100bb', '300x300bb'),
    kind: 'tune',
    isCoverHidden: true,
    source: 'web',
  }
}
