import { expect, mock, test } from 'claude-code/testing'

import { cardsFromPage, cleanName, enrichCard } from '../hooks/discogs'
import * as covers from '../hooks/covers'
import * as deckModule from '../hooks/deck'
import { isRightGuess } from '../hooks/guess'
import { addDistractors, formatFor, varyCard } from '../hooks/variety'
import { cardsFromOpenTdb, noteFromSummary, wikiCandidates } from '../hooks/web'

const SCROLL = { offset: 0, bodyRows: 10 }

const PAGE = {
  pagination: { page: 1, pages: 1 },
  releases: [{
    date_added: '2024-03-02T10:00:00-08:00',
    basic_information: {
      id: 249504,
      title: 'Never Gonna Give You Up',
      year: 1987,
      artists: [{ name: 'Rick Astley' }],
      labels: [{ name: 'RCA', catno: 'PB 41447' }],
      formats: [{ name: 'Vinyl', descriptions: ['7"', 'Single', '45 RPM'] }],
      genres: ['Electronic', 'Pop'],
      styles: ['Synth-pop'],
      cover_image: 'https://i.discogs.com/cover.jpg',
    },
  }],
}

test('builds a trivia card from a Discogs collection item', async () => {
  const [card] = cardsFromPage(PAGE)
  expect(card?.album).toBe('Never Gonna Give You Up')
  expect(card?.artist).toBe('Rick Astley')
  expect(card?.url).toBe('https://www.discogs.com/release/249504')
  expect(card?.coverUrl).toBe('https://i.discogs.com/cover.jpg')
  expect(card?.fact).toBe('Your copy: Vinyl, 7", Single, 45 RPM on RCA (PB 41447)')
  expect(typeof card?.question).toBe('string')
  expect(typeof card?.answer).toBe('string')
})

test('strips Discogs name disambiguation', async () => {
  expect(cleanName('Prince (2)')).toBe('Prince')
  expect(cleanName('The Clash*')).toBe('The Clash')
})

test('enriches a card with tracklist and community numbers', async () => {
  const [card] = cardsFromPage(PAGE)
  const rich = enrichCard(card!, {
    id: 249504,
    tracklist: [{ title: 'Never Gonna Give You Up', type_: 'track' }, { title: 'Never Gonna Give You Up (Instrumental)', type_: 'track' }],
    community: { have: 4136, want: 588 },
    lowest_price: 0.66,
  })
  expect(rich.isEnriched).toBe(true)
  expect(rich.fact).toContain('4,136 have it, 588 want it')
})

test('band shows a record only while Claude works', async ($, on) => {
  // Stands in for the engine's own (empty) band beneath the plugin.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine band')
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({
      plugin: 'record-trivia', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: SCROLL, view: {} },
    })
    expect(await idle.find({ type: 'Text', text: /◉/ })).toBeUndefined()
    await idle.unmount()

    const busy = await $.ui.mount({
      plugin: 'record-trivia', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80, scroll: SCROLL, view: {} },
    })
    expect(await busy.find({ type: 'Text', text: /Q:/ })).toBeDefined()
    await busy.unmount()
  }
})

test('pane reveals the answer and moves to the next record', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'record-trivia', surface, component: 'Pane', requestId: 'record-trivia',
      props: { title: 'Record trivia', isFocused: true, bodyColumns: 70, placement: 'dock', scroll: SCROLL, view: {} },
    })
    expect(await ui.find({ key: 'reveal' })).toBeDefined()
    await ui.press({ key: 'reveal' })
    expect(await ui.find({ key: 'reveal' })).toBeUndefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ key: 'reveal' })).toBeDefined()
    await ui.unmount()
  }
})

test('turns Open Trivia DB questions into multiple-choice cards', async () => {
  const [card] = cardsFromOpenTdb({
    response_code: 0,
    results: [{
      type: 'multiple',
      question: 'Who%20is%20the%20frontman%20of%20Muse%3F',
      correct_answer: 'Matt%20Bellamy',
      incorrect_answers: ['Dominic%20Howard', 'Thom%20Yorke', 'Jonny%20Greenwood'],
    }],
  })
  expect(card?.question).toBe('Who is the frontman of Muse?')
  expect(card?.answer).toBe('Matt Bellamy')
  expect(card?.choices?.length).toBe(4)
  expect(card?.choices).toContain('Matt Bellamy')
  expect(cardsFromOpenTdb({ response_code: 5, results: [] }).length).toBe(0)
})

test('keeps a Wikipedia summary only when it is the right album', async () => {
  const card = { album: 'Rumours', artist: 'Fleetwood Mac', source: 'deck' as const }
  expect(wikiCandidates(card)[0]).toBe('Rumours_(Fleetwood_Mac_album)')
  const note = noteFromSummary(card, {
    type: 'standard',
    extract: 'Rumours is the eleventh studio album by the British and American rock band Fleetwood Mac, released on 4 February 1977, by Warner Bros. Records. Largely recorded in California in 1976, it was produced by the band with Ken Caillat and Richard Dashut.',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Rumours_(album)' } },
    originalimage: { source: 'https://upload.wikimedia.org/wikipedia/en/f/fb/FMacRumours.PNG?utm_source=en.wikipedia.org' },
  })
  expect(note?.imageUrl).toBe('https://upload.wikimedia.org/wikipedia/en/f/fb/FMacRumours.PNG')
  expect(note?.url).toBe('https://en.wikipedia.org/wiki/Rumours_(album)')
  expect(note?.extract.startsWith('Rumours is the eleventh studio album')).toBe(true)
  expect(noteFromSummary(card, {
    type: 'standard',
    extract: 'A rumour is a piece of unverified information.',
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Rumour' } },
  })).toBeUndefined()
})

test('/trivia prints the card in the chat, then the answer', async $ => {
  const shown = await $.command.run({ command: 'trivia', args: '' })
  expect(shown?.text).toContain('Q:')
  expect(shown?.text).toContain('"answer"')
  const answered = await $.command.run({ command: 'answer', args: '' })
  expect(answered?.text).toContain('Next? Reply yes.')
  const next = await $.command.run({ command: 'next', args: '' })
  expect(next?.text).toContain('Reply with your guess')
})

test('wraps a downloaded cover in an SVG the apps can draw', async () => {
  const { coverSvg, coverLineOf, wikimediaThumb, withoutCoverLine } = covers
  expect(wikimediaThumb('https://upload.wikimedia.org/wikipedia/en/9/9c/Princepurplerain.jpg'))
    .toBe('https://upload.wikimedia.org/wikipedia/en/thumb/9/9c/Princepurplerain.jpg/250px-Princepurplerain.jpg')
  expect(coverSvg('/9j/4AAQSkZJRg')).toContain('href="data:image/jpeg;base64,/9j/4AAQSkZJRg"')
  expect(coverSvg('not an image')).toBeUndefined()
  const text = '💿 Purple Rain\n🖼️ Cover: https://example.com/c.jpg\n\nQ: ?'
  expect(coverLineOf(text)).toBe('https://example.com/c.jpg')
  expect(withoutCoverLine(text)).toBe('💿 Purple Rain\n\nQ: ?')
})

test('"yes" after an answer is taken as next; other prompts pass through', async ($, on) => {
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.command.run({ command: 'answer', args: '' })
  expect(await $.prompt.submit({ text: 'yes', wait: false })).toEqual({ drop: '▶ Next record' })
  expect((await $.prompt.submit({ text: 'yes', wait: false }))?.text).toBe('yes')
  await $.command.run({ command: 'next', args: '' })
  expect(await $.prompt.submit({ text: "I don't know", wait: false })).toEqual({ drop: '▶ The answer' })
  await $.command.run({ command: 'next', args: '' })
  expect(await $.prompt.submit({ text: 'Motorcycle', wait: false })).toEqual({ drop: '▶ Your guess: Motorcycle' })
  await $.command.run({ command: 'next', args: '' })
  expect((await $.prompt.submit({ text: 'can you fix the failing build?', wait: false }))?.text).toBe('can you fix the failing build?')
})

test('guesses match forgivingly', async () => {
  const card = (answer: string, choices?: string[]) => ({ album: 'x', artist: 'y', answer, choices, source: 'deck' as const })
  expect(isRightGuess(card('Paul McCartney'), 'mccartney')).toBe(true)
  expect(isRightGuess(card('Paul McCartney'), 'Paul McCartny')).toBe(true)
  expect(isRightGuess(card('Paul McCartney'), 'John Lennon')).toBe(false)
  expect(isRightGuess(card('A motorcycle'), 'Motorcycle')).toBe(true)
  expect(isRightGuess(card('Hipgnosis (Storm Thorgerson)'), 'storm thorgerson')).toBe(true)
  expect(isRightGuess(card('1987'), '1987')).toBe(true)
  expect(isRightGuess(card('1987'), '1986')).toBe(false)
  expect(isRightGuess(card('4,136'), '4136')).toBe(true)
  expect(isRightGuess(card('Matt Bellamy', ['Dominic Howard', 'Matt Bellamy', 'Thom Yorke']), 'b')).toBe(true)
  expect(isRightGuess(card('Matt Bellamy', ['Dominic Howard', 'Matt Bellamy', 'Thom Yorke']), 'C')).toBe(false)
  expect(isRightGuess(card("Don't Stop"), 'dont stop')).toBe(true)
})

test('a right guess scores +10, a wrong one -5, and /score shows the total', async ($, on) => {
  mock.store(on)
  await $.command.run({ command: 'score', args: 'reset' })
  await $.command.run({ command: 'trivia', args: '' })
  const wrong = await $.command.run({ command: 'answer', args: 'definitely not this' })
  expect(wrong?.text).toContain('❌')
  expect(wrong?.text).toContain('Score: -5 (0 right, 1 wrong)')
  // Answering the same card again scores nothing.
  const again = await $.command.run({ command: 'answer', args: 'still wrong' })
  expect(again?.text).not.toContain('❌')
  expect((await $.command.run({ command: 'score', args: '' }))?.text).toContain('Score: -5')
})

test('a right guess earns points', async ($, on) => {
  mock.store(on)
  await $.command.run({ command: 'score', args: 'reset' })
  // Look up the shown card's answer in the deck and guess it.
  const shown = await $.command.run({ command: 'trivia', args: '' })
  const { DECK } = deckModule
  const position = DECK.findIndex(c => shown?.text.includes(c.album))
  const card = varyCard(DECK[position]!, DECK, position)
  const right = await $.command.run({ command: 'answer', args: card.answer ?? '' })
  expect(right?.text).toContain('✅ Right! +10')
  expect(right?.text).toContain('Score: 10 (1 right, 0 wrong)')
})

test('cards play as typed, multiple choice or true/false', async () => {
  const deck = deckModule.DECK
  const formats = new Set<string>()
  for (let position = 0; position < 60; position++) {
    const card = varyCard(deck[position % deck.length]!, deck, position)
    formats.add(card.choices?.length === 2 ? 'truefalse' : card.choices ? 'choice' : 'typed')
    expect(card.choices ? card.choices.includes(card.answer!) : true).toBe(true)
  }
  expect([...formats].sort()).toEqual(['choice', 'truefalse', 'typed'])
  expect(formatFor({ album: 'x', artist: 'y', answer: 'z', source: 'deck' }, 9)).toBe('typed')
})

test('true/false takes yes and no', async () => {
  const card = { album: 'x', artist: 'y', answer: 'False', choices: ['True', 'False'], source: 'deck' as const }
  expect(isRightGuess(card, 'no')).toBe(true)
  expect(isRightGuess(card, 'yes')).toBe(false)
  expect(isRightGuess(card, 'f')).toBe(true)
})

test('collection questions borrow wrong answers from other records', async () => {
  const label = (answer: string) => ({ album: answer, artist: 'y', answer, kind: 'label', source: 'discogs' as const })
  const [first] = addDistractors([label('RCA'), label('Columbia'), label('Motown'), label('Stax')])
  expect(first?.wrong?.length).toBe(3)
  expect(first?.wrong).not.toContain('RCA')
})

test('quiz questions come from Open Trivia DB with a token and mix in every other card', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  const urls: string[] = []
  const quiz = (n: number) => ({
    type: 'multiple',
    question: encodeURIComponent(`Quiz question ${n}?`),
    correct_answer: 'Right',
    incorrect_answers: ['Wrong 1', 'Wrong 2', 'Wrong 3'],
  })
  on('http.fetch', (_$, e) => {
    urls.push(e.url)
    const body = e.url.includes('api_token.php')
      ? { response_code: 0, token: 'tok' }
      : e.url.includes('opentdb.com/api.php')
        ? { response_code: 0, results: [quiz(1), quiz(2), quiz(3)] }
        : {}
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/' }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: true } as never)
  // The first batch is fetched in the background as the session starts.
  for (let i = 0; i < 20 && !urls.some(u => u.includes('opentdb.com/api.php')); i++) await clock.advance(0)
  await clock.advance(0)

  const seen: string[] = []
  for (let i = 0; i < 8; i++) seen.push((await $.command.run({ command: 'next', args: '' }))?.text ?? '')
  const quizCards = seen.filter(t => t.includes('Quiz question'))
  expect(quizCards.length).toBe(4)
  expect(urls.some(u => u.includes('&token=tok'))).toBe(true)
})

test('a typed guess is scored and answered a moment later', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.command.run({ command: 'score', args: 'reset' })
  await $.command.run({ command: 'trivia', args: '' })
  expect(await $.prompt.submit({ text: 'Piano man', wait: false })).toEqual({ drop: '▶ Your guess: Piano man' })
  await clock.advance(100)
  expect((await $.command.run({ command: 'score', args: '' }))?.text).toContain('Score: -5 (0 right, 1 wrong)')
})

test('"restart trivia" starts a new game with the score at 0', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.command.run({ command: 'trivia', args: '' })
  await $.command.run({ command: 'answer', args: 'wrong guess' })
  expect(await $.prompt.submit({ text: 'Restart trivia', wait: false })).toEqual({ drop: '▶ New game' })
  await clock.advance(100)
  expect((await $.command.run({ command: 'score', args: '' }))?.text).toContain('Score: 0 (0 right, 0 wrong)')
  const fresh = await $.command.run({ command: 'trivia', args: 'restart' })
  expect(fresh?.text).toContain('🔄 New game! Score: 0')
})
