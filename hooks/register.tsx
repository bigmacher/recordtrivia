import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { Score, Trivia, WikiNote } from '../types'
import { DECK } from './deck'
import { describeFilter, matchesFilter, parseFilter } from './filter'
import type { Filter } from './filter'
import { gradeGuess } from './guess'
import { MAX_HINTS, hintFor } from './hints'
import { itunesSearchUrl, tuneCard } from './tune'
import type { ItunesSong } from './tune'
import { addDistractors, varyCard } from './variety'
import { cardsFromPage, enrichCard } from './discogs'
import type { CollectionPage, Release } from './discogs'
import { COVER_PX, MAX_COVER_BASE64, coverLineOf, coverSvg, wikimediaThumb, withoutCoverLine } from './covers'
import { OPEN_TDB_TOKEN_URL, OPEN_TDB_URL, cardsFromOpenTdb, noteFromSummary, wikiCandidates, wikiKey } from './web'
import type { OpenTdbResponse, WikiSummary } from './web'

const PANE = 'record-trivia'
const API = 'https://api.discogs.com'
const SYNC_MS = 30 * 60_000
const MAX_PAGES = 10
const USER_AGENT = 'RecordTriviaClaudeMod/0.1 (+https://github.com/bigmacher/recordtrivia)'

const index = atom({ plugin: 'record-trivia', key: 'index' } as const, 0)
const isRevealed = atom({ plugin: 'record-trivia', key: 'isRevealed' } as const, false)
// The strip above the prompt rotates its own card, so it never moves the one you are answering.
const bandIndex = atom({ plugin: 'record-trivia', key: 'bandIndex' } as const, 0)
const isBandRevealed = atom({ plugin: 'record-trivia', key: 'isBandRevealed' } as const, false)
const fromDiscogs = atom({ plugin: 'record-trivia', key: 'fromDiscogs' } as const, [])
const fromWeb = atom({ plugin: 'record-trivia', key: 'fromWeb' } as const, [])
const wiki = atom({ plugin: 'record-trivia', key: 'wiki' } as const, {})
const covers = atom({ plugin: 'record-trivia', key: 'covers' } as const, {})
const awaiting = atom({ plugin: 'record-trivia', key: 'awaiting' } as const, 'none')
const ZERO: Score = { points: 0, right: 0, close: 0, wrong: 0, streak: 0 }
const score = atom({ plugin: 'record-trivia', key: 'score' } as const, ZERO)
const hintsUsed = atom({ plugin: 'record-trivia', key: 'hintsUsed' } as const, 0)
const filterText = atom({ plugin: 'record-trivia', key: 'filterText' } as const, '')
const special = atom({ plugin: 'record-trivia', key: 'special' } as const, null)
const discogsStatus = atom({ plugin: 'record-trivia', key: 'discogsStatus' } as const, 'not set up')

type Settings = { username: string; token: string; isWebOn: boolean; pointsRight: number; pointsClose: number; pointsWrong: number; pointsHint: number }

function discogsHeaders(settings: Settings): Record<string, string> {
  const base = { 'User-Agent': USER_AGENT }
  return settings.token ? { ...base, Authorization: `Discogs token=${settings.token}` } : base
}

// Every third card is an internet quiz question (every other one when the albums are only the built-in deck).
function quizEvery(hasCollection: boolean): number {
  return hasCollection ? 3 : 2
}

// The card at a position: albums and quiz questions each cycle on their own, so neither list limits the other.
async function cardAt($: EngineInterface, position: number): Promise<{ card: Trivia; total: number; quizSlot?: number }> {
  const mine = await read($, fromDiscogs)
  const all = mine.length ? mine : DECK
  const filter = parseFilter(await read($, filterText))
  const picked = filter ? all.filter(c => matchesFilter(c, filter)) : all
  const albums = picked.length ? picked : all
  // Quiz questions carry no decade or genre, so a filter leaves them out.
  const quiz = filter ? [] : await read($, fromWeb)
  const every = quizEvery(mine.length > 0)
  const total = albums.length + quiz.length
  if (quiz.length && position % every === every - 1) {
    const quizSlot = Math.floor(position / every)
    return { card: quiz[quizSlot % quiz.length]!, total, quizSlot }
  }
  const albumSlot = quiz.length ? position - Math.floor((position + 1) / every) : position
  const card = albums[albumSlot % albums.length] ?? DECK[0]!

  return { card: varyCard(card, albums, position), total }
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

async function openTdbToken($: EngineInterface, command: 'request' | 'reset', token?: string): Promise<string | undefined> {
  const query = command === 'reset' && token ? `command=reset&token=${encodeURIComponent(token)}` : 'command=request'
  const res = await $.http.fetch(`${OPEN_TDB_TOKEN_URL}?${query}`, { headers: { 'User-Agent': USER_AGENT } })
  const body = JSON.parse(res.text) as { response_code?: number; token?: string }
  const fresh = body.response_code === 0 ? (body.token ?? token) : undefined
  if (fresh) await $.store.set('opentdbToken', fresh)
  return fresh
}

// Adds the next 50 unseen questions; the token, kept across sessions, means no repeats until all ~500 are done.
async function pullWebQuiz($: EngineInterface, settings: Settings) {
  if (!settings.isWebOn) return
  try {
    let token = ((await $.store.get('opentdbToken')) as string | undefined) ?? (await openTdbToken($, 'request'))
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = token ? `${OPEN_TDB_URL}&token=${encodeURIComponent(token)}` : OPEN_TDB_URL
      const res = await $.http.fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok) return
      const body = JSON.parse(res.text) as OpenTdbResponse
      // 3: the token expired; 4: every question has been served, so start the round again.
      if (body.response_code === 3) token = await openTdbToken($, 'request')
      else if (body.response_code === 4) token = await openTdbToken($, 'reset', token)
      else {
        const cards = cardsFromOpenTdb(body)
        if (!cards.length) return
        await update($, fromWeb, have => {
          const seen = new Set(have.map(c => c.question))
          return [...have, ...cards.filter(c => !seen.has(c.question))].slice(-500)
        })
        return
      }
    }
  } catch {
    // Keep whatever questions we already have.
  }
}

// The card being played in the chat: a Name That Tune round, or the rotation's.
async function currentCard($: EngineInterface): Promise<Trivia> {
  return (await read($, special)) ?? (await cardAt($, await read($, index))).card
}

async function freshCard($: EngineInterface) {
  await update($, isRevealed, () => false)
  await update($, hintsUsed, () => 0)
  await update($, special, () => null)
}

async function nextCard($: EngineInterface, settings: Settings) {
  await freshCard($)
  await afterAdvance($, settings, await update($, index, i => i + 1))
}

async function nextBandCard($: EngineInterface, settings: Settings) {
  await update($, isBandRevealed, () => false)
  await afterAdvance($, settings, await update($, bandIndex, i => i + 1))
}

async function afterAdvance($: EngineInterface, settings: Settings, position: number) {
  void prepareAt($, settings, position + 1)
  // Running low on fresh quiz questions: fetch the next batch.
  const { quizSlot } = await cardAt($, position)
  const quiz = await read($, fromWeb)
  if (quizSlot !== undefined && quizSlot % Math.max(1, quiz.length) >= quiz.length - 5) void pullWebQuiz($, settings)
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
  await update($, fromDiscogs, () => addDistractors(shuffled))
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
  if (card.isCoverHidden) return revealed
  return revealed || !/cover|sleeve|artwork/i.test(card.question ?? '')
}

// A question about the year keeps the year out of sight until the answer.
function yearOf(card: Trivia, revealed: boolean): number | undefined {
  return card.year && (revealed || !card.isYearHidden) ? card.year : undefined
}

function scoreLine(s: Score): string {
  const streak = s.streak >= 3 ? ` · 🔥 ${s.streak} in a row` : ''
  const close = s.close ? `, ${s.close} close` : ''
  return `🏆 Score: ${s.points} (${s.right} right${close}, ${s.wrong} wrong)${streak}`
}

function cardText(card: Trivia, revealed: boolean, note?: WikiNote, verdict?: string, hints: string[] = []): string {
  const lines = verdict ? [verdict, ''] : []
  if (card.kind === 'tune') lines.push('🎧 Name that tune!')
  else lines.push(`💿 ${card.album}${card.artist ? ` — ${card.artist}` : ''}${yearOf(card, revealed) ? ` (${yearOf(card, revealed)})` : ''}`)
  const cover = coverOf(card, note)
  if (cover && isCoverShown(card, revealed)) lines.push(`🖼️ Cover: ${cover}`)
  if (card.question) lines.push('', `Q: ${card.question}`)
  card.choices?.forEach((choice, i) => {
    const mark = revealed && choice === card.answer ? ' ✅' : ''
    lines.push(`   ${String.fromCharCode(65 + i)}. ${choice}${mark}`)
  })
  if (!revealed) hints.forEach((hint, i) => lines.push(`💡 Hint ${i + 1}: ${hint}`))
  if (revealed) {
    if (card.question && !card.choices) lines.push(`A: ${card.answer}`)
    if (card.fact) lines.push('', `♪ ${card.fact}`)
    if (note) lines.push('', note.extract, note.url)
    if (card.url) lines.push(card.url)
    lines.push('', 'Next? Reply yes.')
  } else {
    const how = card.choices?.length === 2 ? 'Reply true or false' : card.choices ? 'Reply with a letter' : 'Reply with your guess'
    const more = hintFor(card, hints.length + 1) ? ', "hint" for a clue' : ''
    lines.push('', `${how}${more}, "answer" to reveal it, or "next" to skip.`)
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

async function cardReply($: EngineInterface, settings: Settings, verdict?: string): Promise<string> {
  const card = await currentCard($)
  const revealed = await read($, isRevealed)
  const used = await read($, hintsUsed)
  const hints = Array.from({ length: used }, (_, i) => hintFor(card, i + 1)).filter((h): h is string => !!h)
  if (settings.isWebOn && card.source !== 'web') await lookUpWikipedia($, card)
  const note = card.source === 'web' ? undefined : (await read($, wiki))[wikiKey(card)] ?? undefined
  if (isCoverShown(card, revealed)) await fetchCover($, card, note)
  await update($, awaiting, () => (revealed ? 'next' : 'answer'))

  // Every card ends with the score; a scored answer already leads with it.
  const total = verdict?.includes('🏆') ? '' : `\n\n${scoreLine(await read($, score))}`

  return cardText(card, revealed, note, verdict, hints) + total
}

// Scores a guess at the open card, once: a card already answered scores nothing.
async function judge($: EngineInterface, settings: Settings, guess: string): Promise<string | undefined> {
  if (!guess || (await read($, isRevealed))) return undefined
  const card = await currentCard($)
  if (!card.answer) return undefined
  const grade = gradeGuess(card, guess)
  const change = grade === 'right' ? settings.pointsRight : grade === 'close' ? -settings.pointsClose : -settings.pointsWrong
  const now = await update($, score, s => ({
    points: s.points + change,
    right: s.right + (grade === 'right' ? 1 : 0),
    close: (s.close ?? 0) + (grade === 'close' ? 1 : 0),
    wrong: s.wrong + (grade === 'wrong' ? 1 : 0),
    streak: grade === 'right' ? s.streak + 1 : 0,
  }))
  await $.store.set('score', now)
  const head = grade === 'right'
    ? `✅ Right! +${settings.pointsRight}`
    : grade === 'close'
      ? `🤏 Close: "${guess}". −${settings.pointsClose}`
      : `❌ Not quite: "${guess}". −${settings.pointsWrong}`

  return `${head}\n${scoreLine(now)}`
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

const YES = /^(y|ya|yes|yeah|yep|yup|sure|ok|okay|next|another|more|go)[.!]*$/i
const REVEAL = /^(answer|reveal|tell me|idk|i don'?t know|don'?t know|dunno|no idea|give up|pass)[.!]*$/i

const SKIP = /^(next|skip)[.!]*$/i
const RESTART = /^(restart|reset|new game|start over|start again|play again)( (the )?(trivia|game))?[.!]*$/i
const RESTART_ANYTIME = /^(restart|reset|new|start) (the )?trivia( game)?[.!]*$/i

const HINT = /^(hint|clue|help|give me a hint|a hint)[.!]*$/i
const TUNE = /^(tune|name that tune|play a song|another tune|play (me )?a tune|song)[.!]*$/i

type TriviaReply = { command: 'next' | 'answer' | 'trivia' | 'hint' | 'tune'; args: string }

// A short reply right after a card is about the card, not a prompt for Claude.
// While a question is open, anything short that is not a question to Claude is a guess.
function triviaReplyTo(text: string, state: 'answer' | 'next' | 'none'): TriviaReply | undefined {
  const reply = text.trim().replace(/[‘’]/g, "'")
  if (RESTART_ANYTIME.test(reply) || (state !== 'none' && RESTART.test(reply))) return { command: 'trivia', args: 'restart' }
  if (/^name that tune[.!]*$/i.test(reply) || (state !== 'none' && TUNE.test(reply))) return { command: 'tune', args: '' }
  if (state === 'answer' && HINT.test(reply)) return { command: 'hint', args: '' }
  if (state === 'none' || !reply || reply.length > 40 || reply.startsWith('/')) return undefined
  if (state === 'next') return YES.test(reply) ? { command: 'next', args: '' } : undefined
  if (SKIP.test(reply)) return { command: 'next', args: '' }
  if (REVEAL.test(reply)) return { command: 'answer', args: '' }
  if (reply.includes('?') || reply.split(/\s+/).length > 6) return undefined
  return { command: 'answer', args: reply }
}

async function giveHint($: EngineInterface, settings: Settings): Promise<string> {
  const card = await currentCard($)
  const used = await read($, hintsUsed)
  if (await read($, isRevealed)) return cardReply($, settings, 'The answer is already out. Reply yes for the next one.')
  if (used >= MAX_HINTS || !hintFor(card, used + 1)) return cardReply($, settings, 'No more hints for this one.')
  await update($, hintsUsed, n => n + 1)
  const now = await update($, score, s => ({ ...s, points: s.points - settings.pointsHint }))
  await $.store.set('score', now)

  return cardReply($, settings, `💡 Hint −${settings.pointsHint}\n${scoreLine(now)}`)
}

// A Name That Tune round: a 30-second iTunes preview of a song by an artist from the deck.
async function startTune($: EngineInterface, settings: Settings): Promise<string> {
  const mine = await read($, fromDiscogs)
  const all = mine.length ? mine : DECK
  const filter = parseFilter(await read($, filterText))
  const pool = filter ? all.filter(c => matchesFilter(c, filter)) : all
  const albums = pool.length ? pool : all
  const seed = Math.floor(await $.clock.now())
  for (let attempt = 0; attempt < 3; attempt++) {
    const album = albums[(seed + attempt * 7919) % albums.length]!
    for (const term of [`${album.artist} ${album.album}`, album.artist]) {
      try {
        const res = await $.http.fetch(itunesSearchUrl(term), { headers: { 'User-Agent': USER_AGENT } })
        if (!res.ok) continue
        const songs = (JSON.parse(res.text) as { results?: ItunesSong[] }).results ?? []
        const card = tuneCard(songs, album.artist, seed + attempt)
        if (!card) continue
        await freshCard($)
        await update($, special, () => card)
        return cardReply($, settings)
      } catch {
        // Try the next search.
      }
    }
  }

  return 'Couldn\'t find a song to play just now. Try again in a moment.'
}

async function setFilter($: EngineInterface, settings: Settings, text: string): Promise<string> {
  if (/^(all|everything|any|clear|none|off)$/i.test(text)) {
    await update($, filterText, () => '')
    await $.store.set('filter', '')
    await nextCard($, settings)
    return cardReply($, settings, '🎚️ Playing everything again.')
  }
  const filter: Filter | undefined = parseFilter(text)
  if (!filter) return 'Try a decade like /trivia 80s, or a genre like /trivia hip hop. /trivia all plays everything.'
  const mine = await read($, fromDiscogs)
  const count = (mine.length ? mine : DECK).filter(c => matchesFilter(c, filter)).length
  if (!count) return `No ${describeFilter(filter)} in the deck. Try another decade or genre, or /trivia all.`
  await update($, filterText, () => text)
  await $.store.set('filter', text)
  await nextCard($, settings)

  return cardReply($, settings, `🎚️ Now playing ${describeFilter(filter)} (${count} of them). /trivia all plays everything.`)
}

// What /trivia, /answer and /next do, shared with replies typed in the chat.
async function runTrivia($: EngineInterface, settings: Settings, reply: TriviaReply): Promise<string> {
  const action = reply.args.trim()
  if (reply.command === 'next' || (reply.command === 'trivia' && action.toLowerCase() === 'next')) {
    await nextCard($, settings)
    return cardReply($, settings)
  }
  if (reply.command === 'answer' || (reply.command === 'trivia' && /^(answer|reveal)$/i.test(action))) {
    const verdict = reply.command === 'answer' ? await judge($, settings, action) : undefined
    await update($, isRevealed, () => true)
    return cardReply($, settings, verdict)
  }
  if (reply.command === 'trivia' && action.toLowerCase() === 'restart') {
    await update($, score, () => ZERO)
    await $.store.set('score', ZERO)
    const now = await $.clock.now()
    await freshCard($)
    await update($, index, () => now % 1000)
    return cardReply($, settings, '🔄 New game!')
  }
  if (reply.command === 'hint') return giveHint($, settings)
  if (reply.command === 'tune') return startTune($, settings)
  if (reply.command === 'trivia' && action) return setFilter($, settings, action)

  return cardReply($, settings)
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    username: String(options.discogsUsername ?? '').trim(),
    token: String(options.discogsToken ?? '').trim(),
    isWebOn: options.webTrivia !== false,
    pointsRight: Math.max(0, Number(options.pointsRight ?? 10)),
    pointsClose: Math.max(0, Number(options.pointsClose ?? 2)),
    pointsWrong: Math.max(0, Number(options.pointsWrong ?? 5)),
    pointsHint: Math.max(0, Number(options.pointsHint ?? 1)),
  }
  const halfMs = Math.max(5, Number(options.rotateSeconds ?? 20)) * 500

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trivia',
      description: 'Show a record trivia card, or pick a decade or genre',
      argumentHint: '[80s|hip hop|all|restart|pane]',
      immediate: true,
    })
    await $.command.register({
      name: 'hint',
      description: 'Get a hint for the current trivia card',
      immediate: true,
    })
    await $.command.register({
      name: 'tune',
      description: 'Name that tune: guess a song from a 30-second preview',
      immediate: true,
    })
    const savedFilter = (await $.store.get('filter')) as string | undefined
    if (typeof savedFilter === 'string') await update($, filterText, () => savedFilter)
    await $.command.register({
      name: 'answer',
      description: 'Reveal the answer to the current trivia card',
      immediate: true,
    })
    await $.command.register({
      name: 'score',
      description: 'Show your record trivia score',
      argumentHint: '[reset]',
      immediate: true,
    })
    const saved = (await $.store.get('score')) as Score | undefined
    if (saved && typeof saved.points === 'number') await update($, score, () => ({ ...ZERO, ...saved }))
    await $.command.register({
      name: 'next',
      description: 'Show the next record trivia card',
      immediate: true,
    })
    const now = await $.clock.now()
    await update($, index, () => now % 1000)
    await update($, bandIndex, () => (now + 500) % 1000)
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
        if (await read($, isBandRevealed)) await nextBandCard($, settings)
        else await update($, isBandRevealed, () => true)
      })()
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const state = await read($, awaiting)
    const reply = triviaReplyTo(e.text, state)
    if (!reply) {
      if (state !== 'none') await update($, awaiting, () => 'none')
      return next(e)
    }
    await update($, awaiting, () => 'none')
    // A command cannot run from inside this hook, so it runs a moment later, on its own.
    $.clock.after(20, () => {
      $.command.run(reply).catch(async () => {
        const text = await runTrivia($, settings, reply)
        await $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } }).catch(() => undefined)
      })
    })

    const said = reply.command === 'next' ? '▶ Next record'
      : reply.command === 'trivia' ? '▶ New game'
        : reply.command === 'hint' ? '▶ Hint'
          : reply.command === 'tune' ? '▶ Name that tune'
            : reply.args ? `▶ Your guess: ${reply.args}` : '▶ The answer'
    return { drop: said }
  }).catch(($, e, next) => next(e))

  // A fresh card each time Claude starts working.
  on('turn.start', async ($, e, next) => {
    await nextBandCard($, settings)

    return next(e)
  })

  // Prints the card into the chat, so it reads the same on a phone as in a terminal.
  on('command.run', { command: 'trivia' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'pane') {
      await $.ui.open({ id: PANE, title: 'Record trivia' })
      return { text: 'Record trivia pane opened.' }
    }

    return { text: await runTrivia($, settings, { command: 'trivia', args: e.args }) }
  })

  on('command.run', { command: 'answer' }, async ($, e) => ({ text: await runTrivia($, settings, { command: 'answer', args: e.args }) }))

  on('command.run', { command: 'score' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'reset') {
      await update($, score, () => ZERO)
      await $.store.set('score', ZERO)
      return { text: '🏆 Score reset to 0.' }
    }

    return { text: `${scoreLine(await read($, score))}\n\n+${settings.pointsRight} for a right answer, −${settings.pointsClose} for a close one, −${settings.pointsWrong} for a wrong one. Reply "restart trivia" to start over.` }
  })

  on('command.run', { command: 'next' }, async $ => ({ text: await runTrivia($, settings, { command: 'next', args: '' }) }))

  on('command.run', { command: 'hint' }, async $ => ({ text: await runTrivia($, settings, { command: 'hint', args: '' }) }))

  on('command.run', { command: 'tune' }, async $ => ({ text: await runTrivia($, settings, { command: 'tune', args: '' }) }))

  // Draws the card's row in the chat with its cover where the surface draws SVG (the apps).
  on('ui.render', { component: 'CommandOutput', props: { command: 'trivia' } }, ($, e, next) => drawCardRow($, e, next))
  on('ui.render', { component: 'CommandOutput', props: { command: 'answer' } }, ($, e, next) => drawCardRow($, e, next))
  on('ui.render', { component: 'CommandOutput', props: { command: 'next' } }, ($, e, next) => drawCardRow($, e, next))
  on('ui.render', { component: 'CommandOutput', props: { command: 'hint' } }, ($, e, next) => drawCardRow($, e, next))
  on('ui.render', { component: 'CommandOutput', props: { command: 'tune' } }, ($, e, next) => drawCardRow($, e, next))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !e.props.isWorking) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { card } = await cardAt($, await read($, bandIndex))
    const revealed = await read($, isBandRevealed)
    const note = (await read($, wiki))[wikiKey(card)]

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="magenta">◉ </Text>
          <Text bold>{card.album}</Text>
          {card.artist ? <Text dimColor> — {card.artist}{yearOf(card, revealed) ? ` (${yearOf(card, revealed)})` : ''}</Text> : null}
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
    const { total } = await cardAt($, await read($, index))
    const card = await currentCard($)
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
            {yearOf(card, revealed) ? <Text dimColor>{String(yearOf(card, revealed))}</Text> : null}
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
