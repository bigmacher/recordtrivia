import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { Trivia, WikiNote } from '../types'
import { DECK } from './deck'
import { cardsFromPage, enrichCard } from './discogs'
import type { CollectionPage, Release } from './discogs'
import { COVER_PX, MAX_COVER_BASE64, coverLineOf, coverSvg, wikimediaThumb, withoutCoverLine } from './covers'
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
const covers = atom({ plugin: 'record-trivia', key: 'covers' } as const, {})
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

function coverOf(card: Trivia, note?: WikiNote | null): string | undefined {
  return card.coverUrl ?? note?.imageUrl
}

// The cover would give away a question about the cover, so it waits for the answer.
function isCoverShown(card: Trivia, revealed: boolean): boolean {
  return revealed || !/cover|sleeve|artwork/i.test(card.question ?? '')
}

function cardText(card: Trivia, revealed: boolean, note?: WikiNote): string {
  const lines = [`💿 ${card.album}${card.artist ? ` — ${card.artist}` : ''}${card.year ? ` (${card.year})` : ''}`]
  const cover = coverOf(card, note)
  if (cover && isCoverShown(card, revealed)) lines.push(`🖼️ Cover: ${cover}`)
  if (card.question) lines.push('', `Q: ${card.question}`)
  card.choices?.forEach((choice, i) => {
    const mark = revealed && choice === card.answer ? ' ✅' : ''
    lines.push(`   ${String.fromCharCode(65 + i)}. ${choice}${mark}`)
  })
  if (revealed) {
    if (card.question && !card.choices) lines.push(`A: ${card.answer}`)
    if (card.fact) lines.push('', `♪ ${card.fact}`)
    if (note) lines.push('', note.extract, note.url)
    if (card.url) lines.push(card.url)
    lines.push('', 'Type /next for another record.')
  } else {
    lines.push('', 'Type /answer to reveal it, or /next to skip.')
  }

  return lines.join('\n')
}

// Downloads a cover as base64 (the host's fetch carries text only).
async function downloadBase64($: EngineInterface, url: string): Promise<string | undefined> {
  try {
    const { exitCode, stdout } = await $.process.run(
      ['sh', '-c', 'curl -sSfL --max-time 10 -A "$2" "$1" | base64 | tr -d "\\n"', 'sh', url, USER_AGENT],
      { timeoutMs: 15_000 },
    )
    return exitCode === 0 && stdout ? stdout : undefined
  } catch {
    return undefined
  }
}

// Caches a card's cover under the URL its text shows, so its chat row can find it.
async function fetchCover($: EngineInterface, card: Trivia, note?: WikiNote) {
  const shown = coverOf(card, note)
  if (!shown || shown in (await read($, covers))) return
  const tries = card.coverUrl ? [card.coverUrl, card.coverThumbUrl] : [wikimediaThumb(shown), shown]
  let bytes: string | null = null
  for (const url of tries) {
    if (!url) continue
    const got = await downloadBase64($, url)
    if (got && got.length <= MAX_COVER_BASE64 && coverSvg(got)) {
      bytes = got
      break
    }
  }
  // Keep the last dozen; each is up to ~120 KB of text.
  await update($, covers, all => Object.fromEntries([...Object.entries(all), [shown, bytes] as const].slice(-12)))
}

async function cardReply($: EngineInterface, settings: Settings): Promise<string> {
  const { card } = await cardAt($, await read($, index))
  const revealed = await read($, isRevealed)
  if (settings.isWebOn && card.source !== 'web') await lookUpWikipedia($, card)
  const note = (await read($, wiki))[wikiKey(card)] ?? undefined
  if (isCoverShown(card, revealed)) await fetchCover($, card, note)

  return cardText(card, revealed, note)
}

async function drawCardRow($: EngineInterface, e: RenderInput<'CommandOutput'>, next: (e: RenderInput<'CommandOutput'>) => Promise<RenderElement>) {
  if (e.surface === 'terminal') return next(e)
  const url = coverLineOf(e.props.text)
  const bytes = url ? (await read($, covers))[url] : undefined
  const svg = bytes ? coverSvg(bytes) : undefined
  if (!svg) return next(e)
  const { Box, Svg, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Svg source={svg} alt="Album cover" width={COVER_PX} height={COVER_PX} />
      <Text>{withoutCoverLine(e.props.text)}</Text>
    </Box>
  )
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
      description: 'Show a record trivia card (answer, next, pane)',
      argumentHint: '[answer|next|pane]',
      immediate: true,
    })
    await $.command.register({
      name: 'answer',
      description: 'Reveal the answer to the current trivia card',
      immediate: true,
    })
    await $.command.register({
      name: 'next',
      description: 'Show the next record trivia card',
      immediate: true,
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

  // Prints the card into the chat, so it reads the same on a phone as in a terminal.
  on('command.run', { command: 'trivia' }, async ($, e) => {
    const action = e.args.trim().toLowerCase()
    if (action === 'pane') {
      await $.ui.open({ id: PANE, title: 'Record trivia' })
      return { text: 'Record trivia pane opened.' }
    }
    if (action === 'next') await nextCard($, settings)
    if (action === 'answer' || action === 'reveal') await update($, isRevealed, () => true)

    return { text: await cardReply($, settings) }
  })

  on('command.run', { command: 'answer' }, async $ => {
    await update($, isRevealed, () => true)

    return { text: await cardReply($, settings) }
  })

  on('command.run', { command: 'next' }, async $ => {
    await nextCard($, settings)

    return { text: await cardReply($, settings) }
  })

  // Draws the card's row in the chat with its cover where the surface draws SVG (the apps).
  on('ui.render', { component: 'CommandOutput', props: { command: 'trivia' } }, ($, e, next) => drawCardRow($, e, next))
  on('ui.render', { component: 'CommandOutput', props: { command: 'answer' } }, ($, e, next) => drawCardRow($, e, next))
  on('ui.render', { component: 'CommandOutput', props: { command: 'next' } }, ($, e, next) => drawCardRow($, e, next))

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
            {coverOf(card, note) && isCoverShown(card, revealed) ? <Link href={coverOf(card, note)!} label="See the cover" /> : null}
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
