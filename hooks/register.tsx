import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Trivia } from '../types'
import { DECK } from './deck'
import { cardsFromPage, enrichCard } from './discogs'
import type { CollectionPage, Release } from './discogs'

const PANE = 'record-trivia'
const API = 'https://api.discogs.com'
const SYNC_MS = 30 * 60_000
const MAX_PAGES = 10

const index = atom({ plugin: 'record-trivia', key: 'index' } as const, 0)
const isRevealed = atom({ plugin: 'record-trivia', key: 'isRevealed' } as const, false)
const fromDiscogs = atom({ plugin: 'record-trivia', key: 'fromDiscogs' } as const, [])
const discogsStatus = atom({ plugin: 'record-trivia', key: 'discogsStatus' } as const, 'not set up')

type Discogs = { username: string; token: string }

function headers(discogs: Discogs): Record<string, string> {
  const base = { 'User-Agent': 'RecordTriviaClaudeMod/0.1 +https://github.com/bigmacher/recordtrivia' }
  return discogs.token ? { ...base, Authorization: `Discogs token=${discogs.token}` } : base
}

// Your collection when Discogs is set up, the built-in crate otherwise.
async function deckOf($: EngineInterface): Promise<Trivia[]> {
  const mine = await read($, fromDiscogs)
  return mine.length ? mine : DECK
}

async function currentCard($: EngineInterface): Promise<{ card: Trivia; total: number }> {
  const deck = await deckOf($)
  const i = (await read($, index)) % deck.length

  return { card: deck[i] ?? DECK[0]!, total: deck.length }
}

// Fetches the full release for a card before it shows, for tracklist and community questions.
async function enrichAt($: EngineInterface, discogs: Discogs, position: number) {
  const deck = await read($, fromDiscogs)
  if (!deck.length) return
  const card = deck[position % deck.length]
  if (!card?.releaseId || card.isEnriched) return
  try {
    const res = await $.http.fetch(`${API}/releases/${card.releaseId}`, { headers: headers(discogs) })
    if (!res.ok) return
    const rich = enrichCard(card, JSON.parse(res.text) as Release)
    await update($, fromDiscogs, list => list.map(c => (c.releaseId === rich.releaseId ? rich : c)))
  } catch {
    // Leave the card as the collection described it.
  }
}

async function nextCard($: EngineInterface, discogs: Discogs) {
  await update($, isRevealed, () => false)
  await update($, index, i => i + 1)
  void enrichAt($, discogs, (await read($, index)) + 1)
}

async function syncCollection($: EngineInterface, discogs: Discogs) {
  if (!discogs.username) {
    await update($, discogsStatus, () => 'not set up')
    return
  }
  await update($, discogsStatus, () => 'syncing…')
  const user = encodeURIComponent(discogs.username)
  const cards: Trivia[] = []
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await $.http.fetch(
        `${API}/users/${user}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=desc`,
        { headers: headers(discogs) },
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
  await update($, discogsStatus, () => `${shuffled.length} records from ${discogs.username}`)
  await enrichAt($, discogs, 0)
  void enrichAt($, discogs, 1)
}

export const register: Register = (on, options) => {
  const discogs: Discogs = {
    username: String(options.discogsUsername ?? '').trim(),
    token: String(options.discogsToken ?? '').trim(),
  }
  const halfMs = Math.max(5, Number(options.rotateSeconds ?? 20)) * 500

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trivia',
      description: 'Open the record trivia pane',
    })
    const now = await $.clock.now()
    await update($, index, () => now % 1000)
    void syncCollection($, discogs)
    $.clock.every(SYNC_MS, () => void syncCollection($, discogs))
    // Flip the card to its answer, then advance, on a steady beat.
    $.clock.every(halfMs, () => {
      void (async () => {
        if (await read($, isRevealed)) await nextCard($, discogs)
        else await update($, isRevealed, () => true)
      })()
    })

    return next(e)
  })

  // A fresh card each time Claude starts working.
  on('turn.start', async ($, e, next) => {
    await nextCard($, discogs)

    return next(e)
  })

  on('command.run', { command: 'trivia' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Record trivia' })

    return { text: 'Record trivia pane opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !e.props.isWorking) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { card } = await currentCard($)
    const revealed = await read($, isRevealed)

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
        {card.fact && (!card.question || revealed) ? <Text dimColor>♪ {card.fact}</Text> : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const { card, total } = await currentCard($)
    const revealed = await read($, isRevealed)
    const status = await read($, discogsStatus)
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
            {card.url ? <Link href={card.url} label="View on Discogs" /> : <Text dimColor>from the crate</Text>}
          </Box>
        </Box>
        <Text> </Text>
        {card.question ? (
          <Text>
            <Text color="yellow">Q: </Text>
            {card.question}
          </Text>
        ) : null}
        {card.question && revealed ? <Text color="green">A: {card.answer}</Text> : null}
        {card.fact && (!card.question || revealed) ? <Text dimColor>♪ {card.fact}</Text> : null}
        <Text> </Text>
        <Box flexDirection="row">
          {card.question && !revealed ? (
            <Button key="reveal" label="Reveal" hotkey="r" variant="primary"
              onPress={() => update($, isRevealed, () => true)} />
          ) : null}
          <Button key="next" label="Next record" hotkey="n" onPress={() => nextCard($, discogs)} />
          <Button key="sync" label="Sync Discogs" hotkey="s" onPress={() => syncCollection($, discogs)} />
        </Box>
        <Text dimColor>{total} cards · Discogs: {status}</Text>
      </Box>
    )
  })
}
