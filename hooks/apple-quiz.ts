import type { Trivia } from '../types'

// Questions built from Apple Music (iTunes Search) song data. Only what the data states
// reliably is asked: which album a song is on, and who recorded it. Release dates are
// left alone, since iTunes often dates a reissue rather than the original record.

export type AppleSong = {
  trackName?: string
  artistName?: string
  collectionName?: string
  collectionArtistName?: string
  primaryGenreName?: string
  artworkUrl100?: string
  trackNumber?: number
}

// Well-known artists to search for, grouped so a wrong "who recorded" option sounds like the right one.
export const ARTIST_GROUPS: Record<string, string[]> = {
  'Classic Rock': ['The Beatles', 'The Rolling Stones', 'Led Zeppelin', 'Pink Floyd', 'Queen', 'The Who', 'The Kinks', 'The Doors', 'Jimi Hendrix', 'Creedence Clearwater Revival', 'The Beach Boys', 'Eagles', 'Fleetwood Mac', 'Lynyrd Skynyrd', 'The Allman Brothers Band', 'Santana', 'ZZ Top', 'Boston', 'Foreigner', 'Journey', 'Cheap Trick', 'Steely Dan', 'Elton John', 'David Bowie', 'Bruce Springsteen', 'Tom Petty and the Heartbreakers', 'Billy Joel', 'Dire Straits'],
  'Hard Rock & Metal': ['AC/DC', 'Black Sabbath', 'Deep Purple', 'Aerosmith', 'Kiss', 'Van Halen', "Guns N' Roses", 'Metallica', 'Iron Maiden', 'Def Leppard', 'Bon Jovi', 'Rush', 'Heart', 'Pat Benatar'],
  'Singer-Songwriter & Folk': ['Bob Dylan', 'Simon & Garfunkel', 'Joni Mitchell', 'Neil Young', 'Crosby, Stills, Nash & Young', 'James Taylor', 'Carole King', 'Janis Joplin', 'Sheryl Crow', 'Alanis Morissette'],
  'Punk & New Wave': ['The Clash', 'Ramones', 'Sex Pistols', 'Blondie', 'Talking Heads', 'The Police', 'The Pretenders', 'The Cure', 'The Smiths', 'Depeche Mode', 'New Order', 'Duran Duran', 'Tears for Fears', 'Eurythmics'],
  '80s Pop & Rock': ['U2', 'R.E.M.', 'INXS', 'Phil Collins', 'Peter Gabriel', 'Sting', 'Genesis', 'Yes', 'Madonna', 'Cyndi Lauper', 'George Michael', 'Whitney Houston', 'Janet Jackson', 'Michael Jackson', 'Prince'],
  'Soul & Funk': ['Stevie Wonder', 'Marvin Gaye', 'Aretha Franklin', 'Otis Redding', 'Al Green', 'Earth, Wind & Fire', 'Chic', 'Donna Summer', 'Bee Gees', 'ABBA', 'The Supremes', 'The Temptations', 'Ray Charles'],
  'Country': ['Johnny Cash', 'Dolly Parton', 'Willie Nelson', 'Patsy Cline', 'Garth Brooks', 'Shania Twain'],
  '90s Alternative': ['Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'Red Hot Chili Peppers', 'Foo Fighters', 'Green Day', 'The Smashing Pumpkins', 'Radiohead', 'Oasis', 'Blur', 'Weezer', 'Beck', 'No Doubt', 'Counting Crows', 'Hootie & the Blowfish', 'Dave Matthews Band'],
  'Hip Hop': ['Run-D.M.C.', 'Beastie Boys', 'Public Enemy', 'A Tribe Called Quest', 'De La Soul', 'Dr. Dre', 'Snoop Dogg', 'The Notorious B.I.G.', '2Pac', 'Nas', 'Jay-Z', 'OutKast', 'Missy Elliott', 'Eminem', 'Kanye West', 'Kendrick Lamar', 'Drake', 'Lauryn Hill', 'Fugees'],
  'Modern Pop & R&B': ['Beyoncé', "Destiny's Child", 'Mariah Carey', 'Usher', 'Alicia Keys', 'Rihanna', 'Lady Gaga', 'Taylor Swift', 'Adele', 'Amy Winehouse', 'Bruno Mars', 'Billie Eilish', 'Harry Styles', 'Dua Lipa'],
  '2000s Rock': ['Coldplay', 'The White Stripes', 'The Strokes', 'Arctic Monkeys', 'The Killers', 'Kings of Leon', 'Arcade Fire', 'Vampire Weekend', 'Daft Punk', 'Gorillaz'],
  'Jazz & Standards': ['Miles Davis', 'John Coltrane', 'Louis Armstrong', 'Ella Fitzgerald', 'Frank Sinatra', 'Nina Simone'],
  'Early Rock & Reggae': ['Elvis Presley', 'Chuck Berry', 'Buddy Holly', 'Bob Marley & The Wailers'],
}

export const ARTISTS = Object.values(ARTIST_GROUPS).flat()

// Artists in the same group as this one, for believable wrong answers.
export function peersOf(artist: string): string[] {
  const group = Object.values(ARTIST_GROUPS).find(g => g.includes(artist))
  return (group ?? ARTISTS).filter(a => a !== artist)
}

// Compilations, live sets, singles and EPs say little about the record a song belongs to.
const NOT_AN_ALBUM = /greatest hits|best of|\bhits\b|collection|essential|anthology|karaoke|tribute|playlist|\bgold\b|ultimate|definitive|singles|\(live|live at|live in|live from|unplugged|sessions|soundtrack| - single$| - ep$|\bmix(es)?\b|remixes|christmas|holiday|box set|boxset|\bvol(ume)?\.? ?\d|music from|inspired by|motion picture|original score|: the album$/i

// "Rumours (Super Deluxe Edition)" → "Rumours".
export function cleanAlbum(name: string): string {
  return name
    .replace(/\s*[([]\+[^)\]]*[)\]]/g, '')
    .replace(/\s*[([][^)\]]*(deluxe|remaster|edition|version|expanded|anniversary|bonus|mono|stereo|reissue|feat\.|featuring)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(deluxe|remaster|edition|version|expanded|anniversary).*$/i, '')
    .trim()
}

export function cleanSong(name: string): string {
  return name
    .replace(/\s*[([][^)\]]*(remaster|version|mono|stereo|live|edit|mix|demo|feat\.|featuring|with |vault)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*(remaster|version|mono|stereo|live|edit|mix).*$/i, '')
    .trim()
}

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

function pickN<T>(items: T[], n: number, seed: number): T[] {
  return items
    .map((item, i) => ({ item, key: hash(`${seed}:${i}`) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, n)
    .map(x => x.item)
}

const GENRE_ALIASES: Record<string, string[]> = {
  'Hip-Hop/Rap': ['Hip Hop', 'Rap'],
  'R&B/Soul': ['R&B', 'Funk / Soul', 'Soul'],
  'Hard Rock': ['Rock', 'Hard Rock'],
  'Metal': ['Metal', 'Rock'],
  'Alternative': ['Alternative', 'Rock'],
  'Singer/Songwriter': ['Folk', 'Singer/Songwriter'],
}

function genresOf(genre?: string): string[] | undefined {
  if (!genre) return undefined
  return GENRE_ALIASES[genre] ?? [genre]
}

type Song = { track: string; album: string; artist: string; genre?: string; artwork?: string }

// The artist's own studio-album songs, one entry per (song, album).
export function songsOf(results: AppleSong[], artist: string): Song[] {
  const key = artist.toLowerCase()
  const out: Song[] = []
  const seen = new Set<string>()
  for (const r of results) {
    const by = (r.artistName ?? '').toLowerCase()
    const albumBy = (r.collectionArtistName ?? r.artistName ?? '').toLowerCase()
    if (!r.trackName || !r.collectionName || by !== key || albumBy !== key) continue
    if (NOT_AN_ALBUM.test(r.collectionName)) continue
    const track = cleanSong(r.trackName)
    const album = cleanAlbum(r.collectionName)
    if (!track || !album || track.toLowerCase() === album.toLowerCase()) continue
    const id = `${track.toLowerCase()}|${album.toLowerCase()}`
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ track, album, artist: r.artistName!, genre: r.primaryGenreName, artwork: r.artworkUrl100 })
  }
  return out
}

// Builds the three kinds of question for one artist. `otherArtists` supplies wrong answers to "who recorded".
export function appleCards(results: AppleSong[], artist: string, otherArtists: string[]): Trivia[] {
  const songs = songsOf(results, artist)
  // A song found on two albums would make "which album" ambiguous.
  const albumsBySong = new Map<string, Set<string>>()
  for (const s of songs) {
    const set = albumsBySong.get(s.track.toLowerCase()) ?? new Set<string>()
    set.add(s.album)
    albumsBySong.set(s.track.toLowerCase(), set)
  }
  const unique = songs.filter(s => albumsBySong.get(s.track.toLowerCase())!.size === 1)
  const albums = [...new Set(unique.map(s => s.album))]
  const cards: Trivia[] = []
  const base = (s: Song) => ({
    album: s.album,
    artist: s.artist,
    genres: genresOf(s.genre),
    coverUrl: s.artwork?.replace('100x100bb', '300x300bb'),
    source: 'apple' as const,
  })

  for (const s of pickN(unique, 6, hash(artist))) {
    const seed = hash(`${s.track}|${s.album}`)
    // Which album is it on?
    // Leave out editions of the same record ("X" and "X: The Encore") so only one option is right.
    const related = (x: string, y: string) => x.toLowerCase().startsWith(y.toLowerCase()) || y.toLowerCase().startsWith(x.toLowerCase())
    const wrongAlbums = albums.filter(a => !related(a, s.album)).filter((a, i, all) => !all.slice(0, i).some(b => related(a, b)))
    if (wrongAlbums.length >= 3) {
      cards.push({
        ...base(s),
        question: `Which ${s.artist} album is "${s.track}" on?`,
        answer: s.album,
        wrong: pickN(wrongAlbums, 3, seed),
        kind: 'apple-album',
        isCoverHidden: true,
        isHeaderHidden: true,
      })
    }
    // Who recorded it? The album name keeps it unambiguous when others covered the song.
    const wrongArtists = otherArtists.filter(a => a.toLowerCase() !== s.artist.toLowerCase())
    const isSelfTitled = s.album.toLowerCase().includes(s.artist.toLowerCase().replace(/^the /, ''))
    if (wrongArtists.length >= 3 && !isSelfTitled) {
      cards.push({
        ...base(s),
        question: `Who recorded "${s.track}", from the album "${s.album}"?`,
        answer: s.artist,
        wrong: pickN(wrongArtists, 3, seed + 1),
        kind: 'apple-artist',
        isCoverHidden: true,
        isHeaderHidden: true,
      })
    }
  }

  // Which of these is on a given album? Wrong options are songs found only on the artist's other albums.
  for (const album of pickN(albums, 2, hash(`${artist}:albums`))) {
    const on = unique.filter(s => s.album === album)
    const off = unique.filter(s => s.album !== album)
    const right = on[0]
    if (!right || off.length < 3) continue
    const choices = pickN([right.track, ...pickN(off.map(s => s.track), 3, hash(album))], 4, hash(`${album}:order`))
    cards.push({
      ...base(right),
      question: `Which of these songs is on ${right.artist}'s album "${album}"?`,
      answer: right.track,
      choices,
      kind: 'apple-tracklist',
    })
  }

  return cards
}

export function appleSearchUrl(artist: string): string {
  return `https://itunes.apple.com/search?entity=song&attribute=artistTerm&limit=200&term=${encodeURIComponent(artist)}`
}
