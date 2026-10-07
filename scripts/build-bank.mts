// Builds web/bank.json: every built-in deck card plus questions generated from Apple Music
// data for each artist in ARTIST_GROUPS. Run: npx tsx scripts/build-bank.mts [cacheDir]
// Raw search results are cached per artist, so an interrupted run picks up where it stopped.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ARTISTS, appleCards, appleSearchUrl, peersOf } from '../hooks/apple-quiz.ts'
import { DECK } from '../hooks/deck.ts'

const cacheDir = process.argv[2] ?? '.bank-cache'
mkdirSync(cacheDir, { recursive: true })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const fileFor = (artist: string) => join(cacheDir, `${artist.replace(/[^a-z0-9]+/gi, '_')}.json`)

async function results(artist: string): Promise<unknown[]> {
  const file = fileFor(artist)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(appleSearchUrl(artist))
      if (res.status === 403 || res.status === 429) {
        await sleep(30_000)
        continue
      }
      const body = (await res.json()) as { results?: unknown[] }
      writeFileSync(file, JSON.stringify(body.results ?? []))
      return body.results ?? []
    } catch {
      await sleep(5_000)
    }
  }
  return []
}

// Four searches at a time, spaced out to stay under Apple's limit of about 20 a minute.
const queue = [...ARTISTS]
let done = 0
async function worker(delay: number) {
  await sleep(delay)
  for (let artist = queue.shift(); artist; artist = queue.shift()) {
    await results(artist)
    console.log(`${++done}/${ARTISTS.length} ${artist}`)
    await sleep(3_000)
  }
}
await Promise.all([0, 1, 2, 3].map(i => worker(i * 1_500)))

const cards = [...DECK]
for (const artist of ARTISTS) cards.push(...appleCards((await results(artist)) as never, artist, peersOf(artist)))
mkdirSync(new URL('../web/', import.meta.url), { recursive: true })
writeFileSync(new URL('../web/bank.json', import.meta.url), JSON.stringify(cards))
console.log(`wrote ${cards.length} cards`)
