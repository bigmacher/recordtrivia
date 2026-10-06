import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Trivia, WikiNote } from '../types'
import { DECK } from './deck'
import { cardsFromPage, enrichCard } from './discogs'
import type { CollectionPage, Release } from './discogs'
import { OPEN_TDB_URL, cardsFromOpenTdb, noteFromSummary, wikiCandidates, wikiKey } from './web'
import type { OpenTdbResponse, WikiSummary } from './web'

const PANE = 'record-trivia'
const API = 'https://api.discogs.com'
const SYNC_MS = 30 * 60_000
const MAX_PAGES = 10
const USER_AGENT = 'RecordTriviaClaudeMod/0.1 (+https://github.com/bigmacher/recordtrivia)'

const index = atom({ plugin: 'record-trivia', key: 'index' } as const, 0)
const isRevealed = atom({ plugin: 'record-trivia', key: 'isRevealed' } as const, false)
const fromDiscogs = atom({ plugin: 'record-trivia', key: 'fromDiscogs' } as const, [])
const fromWeb = atom({ plugin: 'record-trivia', key: 'fromWeb' } as const, [])
const wiki = atom({ plugin: 'record-trivia', key: 'wiki' } as const, {})
const discogsStatus = atom({ plugin: 'record-trivia', key: 'discogsStatus' } as const, 'not set up')

type Settings = { username: string; token: string; isWebOn: boolean }

function discogsHeaders(settings: Settings): Record<string, string> {
  const base = { 'User-Agent': USER_AGENT }
  return settings.token ? { ...base, Authorization: `Discogs token=${settings.token}` } : base
}

// Albums from your collection (or the built-in crate), with an internet quiz question every third card.
async function deckOf($: EngineInterface): Promise<Trivia[]> {
  const mine = await read($, fromDiscogs)
  const albums = mine.length ? mine : DECK
  const quiz = await read($, fromWeb)
  if (!quiz.length) return albums
  const out: Trivia[] = []
  albums.forEach((album, i) => {
    out.push(album)
    const q = quiz[Math.floor(i / 2) % quiz.length]
    if (i % 2 === 1 && q) out.push(q)
  })

  return out
}

async function cardAt($: EngineInterface, position: number): Promise<{ card: Trivia; total: number }> {
  const deck = await deckOf($)

  return { card: deck[position % deck.length] ?? DECK[0]!, total: deck.length }
}

async function lookUpWikipedia($: EngineInterface, card: Trivia) {
  const key = wikiKey(card)
  if (key in (await read($, wiki))) return
  let note: WikiNote | null = null
  for (const title of wikiCandidates(card)) {
    try {
      const res = await $.http.fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { headers: { 'User-Agent': USER_AGENT } },
      )
      if (res.status === 429) return // Try again on a later card.
      if (!res.ok) continue
      note = noteFromSummary(card, JSON.parse(res.text) as WikiSummary) ?? null
      if (note) break
    } catch {
      return
    }
  }
  await update($, wiki, notes => ({ ...notes, [key]: note }))
}

async function enrichDiscogs($: EngineInterface, settings: Settings, card: Trivia) {
  if (!card.releaseId || card.isEnriched) return
  try {
    const res = await $.http.fetch(`${API}/releases/${card.releaseId}`, { headers: discogsHeaders(settings) })
    if (!res.ok) return
    const rich = enrichCard(card, JSON.parse(res.text) as Release)
    await update($, fromDiscogs, list => list.map(c => (c.releaseId === rich.releaseId ? rich : c)))
  } catch {
    // Leave the card as the collection described it.
  }
}

// Gets a card's extras (Discogs release details, Wikipedia) before it comes up.
async function prepareAt($: EngineInterface, settings: Settings, position: number) {
  const { card } = await cardAt($, position)
  if (card.source === 'web') return
  await enrichDiscogs($, settings, card)
  if (settings.isWebOn) await lookUpWikipedia($, card)
}

async function pullWebQuiz($: EngineInterface, settings: Settings) {
  if (!settings.isWebOn) return
  try {
    const res = await $.http.fetch(OPEN_TDB_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) return
    const cards = cardsFromOpenTdb(JSON.parse(res.text) as OpenTdbResponse)
    if (cards.length) await update($, fromWeb, () => cards)
  } catch {
    // Keep whatever questions we already have.
  }
}

async function nextCard($: EngineInterface, settings: Settings) {
  await update($, isRevealed, () => false)
  await update($, index, i => i + 1)
  void prepareAt($, settings, (await read($, index)) + 1)
}

async function syncCollection($: EngineInterface, settings: Settings) {
  if (!settings.username) {
    await update($, discogsStatus, () => 'not set up')
    return
  }
  await update($, discogsStatus, () => 'syncing…')
  const user = encodeURIComponent(settings.username)
  const cards: Trivia[] = []
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await $.http.fetch(
        `${API}/users/${user}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`,
        { headers: discogsHeaders(settings) },
      )
      if (!res.ok) {
        const why = res.status === 401 || res.status === 403 ? 'collection is private, add a token' : res.status === 404 ? 'user not found' : `error ${res.status}`
        await update($, discogsStatus, () => why)
        return
      }
      const body = JSON.parse(res.text) as CollectionPage
      cards.push(...cardsFromPage(body))
      if (page >= (body.pagination?.pages ?? 1)) break
    }
  } catch {
    await update($, discogsStatus, () => 'unreachable')
    return
  }
  // Shuffle so each session digs through a different part of the crate.
  const seed = await $.clock.now()
  const shuffled = cards
    .map((card, i) => ({ card, key: ((card.releaseId ?? i) * 2654435761 + seed) % 4294967296 }))
    .sort((a, b) => a.key - b.key)
    .map(x => x.card)
  await update($, fromDiscogs, () => shuffled)
  await update($, index, () => 0)
  await update($, discogsStatus, () => `${shuffled.length} records from ${settings.username}`)
  await prepareAt($, settings, 0)
  void prepareAt($, settings, 1)
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    username: String(options.discogsUsername ?? '').trim(),
    token: String(options.discogsToken ?? '').trim(),
    isWebOn: options.webTrivia !== false,
  }
  const halfMs = Math.max(5, Number(options.rotateSeconds ?? 20)) * 500

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trivia',
      description: 'Open the record trivia pane',
    })
    const now = await $.clock.now()
    await update($, index, () => now % 1000)
    void (async () => {
      await pullWebQuiz($, settings)
      await syncCollection($, settings)
      await prepareAt($, settings, await read($, index))
    })()
    $.clock.every(SYNC_MS, () => {
      void syncCollection($, settings)
      void pullWebQuiz($, settings)
    })
    // Flip the card to its answer, then advance, on a steady beat.
    $.clock.every(halfMs, () => {
      void (async () => {
        if (await read($, isRevealed)) await nextCard($, settings)
        else await update($, isRevealed, () => true)
      })()
    })

    return next(e)
  })

  // A fresh card each time Claude starts working.
  on('turn.start', async ($, e, next) => {
    await nextCard($, settings)

    return next(e)
  })

  on('command.run', { command: 'trivia' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Record trivia' })

    return { text: 'Record trivia pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !e.props.isWorking) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { card } = await cardAt($, await read($, index))
    const revealed = await read($, isRevealed)
    const note = (await read($, wiki))[wikiKey(card)]

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="magenta">◉ </Text>
          <Text bold>{card.album}</Text>
          {card.artist ? <Text dimColor> — {card.artist}{card.year ? ` (${card.year})` : ''}</Text> : null}
        </Text>
        {card.question ? (
          <Text>
            <Text color="yellow">Q: </Text>
            {card.question}
            {revealed ? <Text color="green">  → {card.answer}</Text> : <Text dimColor>  (answer soon…)</Text>}
          </Text>
        ) : null}
        {card.choices && !revealed ? <Text dimColor>   {card.choices.join('  ·  ')}</Text> : null}
        {card.fact && (!card.question || revealed) ? <Text dimColor>♪ {card.fact}</Text> : null}
        {note && revealed ? <Text dimColor>W: {note.extract}</Text> : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const { card, total } = await cardAt($, await read($, index))
    const revealed = await read($, isRevealed)
    const status = await read($, discogsStatus)
    const quizCount = (await read($, fromWeb)).length
    const note = (await read($, wiki))[wikiKey(card)]
    const label = card.album.slice(0, 9).toUpperCase().padEnd(9)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="column" marginRight={2}>
            <Text color="gray">  ▄▄█████▄▄  </Text>
            <Text color="gray"> ██▀     ▀██ </Text>
            <Text>
              <Text color="gray">██ </Text>
              <Text color="black" backgroundColor="magenta">{label}</Text>
              <Text color="gray"> ██</Text>
            </Text>
            <Text color="gray"> ██▄  ●  ▄██ </Text>
            <Text color="gray">  ▀▀█████▀▀  </Text>
          </Box>
          <Box flexDirection="column">
            <Text bold>{card.album}</Text>
            <Text>{card.artist}</Text>
            {card.year ? <Text dimColor>{String(card.year)}</Text> : null}
            {card.url ? <Link href={card.url} label="View on Discogs" /> : null}
            {note ? <Link href={note.url} label="Read on Wikipedia" /> : null}
          </Box>
        </Box>
        <Text> </Text>
        {card.question ? (
          <Text>
            <Text color="yellow">Q: </Text>
            {card.question}
          </Text>
        ) : null}
        {card.choices ? card.choices.map((choice, i) => (
          <Text color={revealed && choice === card.answer ? 'green' : undefined} dimColor={revealed && choice !== card.answer}>
            {'   '}{String.fromCharCode(65 + i)}. {choice}
          </Text>
        )) : null}
        {card.question && revealed && !card.choices ? <Text color="green">A: {card.answer}</Text> : null}
        {card.fact && (!card.question || revealed) ? <Text dimColor>♪ {card.fact}</Text> : null}
        {note && revealed ? <Text dimColor>W: {note.extract}</Text> : null}
        <Text> </Text>
        <Box flexDirection="row">
          {card.question && !revealed ? (
            <Button key="reveal" label="Reveal" hotkey="r" variant="primary"
              onPress={() => update($, isRevealed, () => true)} />
          ) : null}
          <Button key="next" label="Next record" hotkey="n" onPress={() => nextCard($, settings)} />
          <Button key="sync" label="Sync" hotkey="s" onPress={async () => {
            await pullWebQuiz($, settings)
            await syncCollection($, settings)
          }} />
        </Box>
        <Text dimColor>
          {total} cards · Discogs: {status} · Web: {settings.isWebOn ? `${quizCount} quiz questions + Wikipedia` : 'off'}
        </Text>
      </Box>
    )
  })
}
