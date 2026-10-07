import { expect, mock, test } from 'claude-code/testing'

import { cardsFromPage, cleanName, enrichCard } from '../hooks/discogs'
import { appleCards, cleanAlbum, peersOf } from '../hooks/apple-quiz'
import * as covers from '../hooks/covers'
import * as deckModule from '../hooks/deck'
import { matchesFilter, parseFilter } from '../hooks/filter'
import { gradeGuess, isRightGuess } from '../hooks/guess'
import { hintFor } from '../hooks/hints'
import { cleanTrackName, tuneCard } from '../hooks/tune'
import { addDistractors, formatFor, varyCard } from '../hooks/variety'
import { cardsFromOpenTdb, noteFromSummary, wikiCandidates } from '../hooks/web'

const SCROLL = { offset: 0, bodyRows: 10 }

const firstLine = (result: unknown) => ((result as { drop?: string })?.drop ?? '').split('\n')[0]

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
    expect(await busy.find({ type: 'Text', text: /RECORD TRIVIA/ })).toBeDefined()
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
  expect(shown?.text).toContain('🏆 Score:')
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
  mock.store(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.command.run({ command: 'answer', args: '' })
  expect(firstLine(await $.prompt.submit({ text: 'yes', wait: false }))).toBe('▶ Next record')
  // The next card is open now, so a question for Claude passes through and ends the exchange.
  expect((await $.prompt.submit({ text: 'can you look at my build?', wait: false }))?.text).toBe('can you look at my build?')
  expect((await $.prompt.submit({ text: 'yes', wait: false }))?.text).toBe('yes')
  await $.command.run({ command: 'next', args: '' })
  expect(firstLine(await $.prompt.submit({ text: "I don't know", wait: false }))).toBe('▶ The answer')
  await $.command.run({ command: 'next', args: '' })
  expect(firstLine(await $.prompt.submit({ text: 'Motorcycle', wait: false }))).toBe('▶ Your guess: Motorcycle')
  await $.command.run({ command: 'next', args: '' })
  expect((await $.prompt.submit({ text: 'can you fix the failing build?', wait: false }))?.text).toBe('can you fix the failing build?')
})

test('a short request to Claude is not taken as a guess or a yes', async ($, on) => {
  mock.store(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  for (const text of ['run the tests', 'commit and push', 'fix it', 'help']) {
    await $.command.run({ command: 'next', args: '' })
    expect((await $.prompt.submit({ text, wait: false }))?.text).toBe(text)
  }
  await $.command.run({ command: 'answer', args: '' })
  expect((await $.prompt.submit({ text: 'ok', wait: false }))?.text).toBe('ok')
  await $.command.run({ command: 'answer', args: '' })
  expect((await $.prompt.submit({ text: 'sure', wait: false }))?.text).toBe('sure')
})

test('the open card stays put when a background fetch adds questions', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let isQuizIn = false
  on('http.fetch', async (_$, e) => {
    const body = e.url.includes('api_token.php')
      ? { response_code: 0, token: 'tok' }
      : e.url.includes('opentdb.com/api.php')
        ? (await gate, isQuizIn = true, {
          response_code: 0,
          results: [1, 2, 3].map(n => ({ type: 'multiple', question: encodeURIComponent(`Quiz question ${n}?`), correct_answer: 'Right', incorrect_answers: ['W1', 'W2', 'W3'] })),
        })
        : {}
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } }
  })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', () => ({ cwd: '/' }))
  await $.session.start({ cwd: '/', surface: null, isInteractive: true } as never)
  // With only albums loaded, position 1 is an album; once the quiz arrives it would be a quiz question.
  const shown = (await $.command.run({ command: 'next', args: '' }))?.text ?? ''
  release()
  for (let i = 0; i < 20 && !isQuizIn; i++) await clock.advance(0)
  await clock.advance(0)
  const revealed = (await $.command.run({ command: 'answer', args: '' }))?.text ?? ''
  const question = (t: string) => t.split('\n').find(l => l.startsWith('Q: '))
  expect(isQuizIn).toBe(true)
  expect(question(shown)).toBeDefined()
  expect(question(revealed)).toBe(question(shown))
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
  const dropped = await $.prompt.submit({ text: 'Piano man', wait: false })
  // The answer card comes back in the same line, with no command of the mod's own in between.
  expect(firstLine(dropped)).toBe('▶ Your guess: Piano man')
  expect((dropped as { drop?: string }).drop).toContain('❌ Not quite: "Piano man". −5')
  await clock.advance(100)
  expect((await $.command.run({ command: 'score', args: '' }))?.text).toContain('Score: -5 (0 right, 1 wrong)')
})

test('"restart trivia" starts a new game with the score at 0', async ($, on) => {
  mock.store(on)
  const clock = mock.clock(on)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.command.run({ command: 'trivia', args: '' })
  await $.command.run({ command: 'answer', args: 'wrong guess' })
  const restarted = await $.prompt.submit({ text: 'Restart trivia', wait: false })
  expect(firstLine(restarted)).toBe('▶ New game')
  expect((restarted as { drop?: string }).drop).toContain('🔄 New game!')
  await clock.advance(100)
  expect((await $.command.run({ command: 'score', args: '' }))?.text).toContain('Score: 0 (0 right, 0 wrong)')
  const fresh = await $.command.run({ command: 'trivia', args: 'restart' })
  expect(fresh?.text).toContain('🔄 New game!')
  expect(fresh?.text).toContain('🏆 Score: 0 (0 right, 0 wrong)')
})

test('close guesses are told apart from wrong ones', async () => {
  const card = (answer: string, choices?: string[]) => ({ album: 'x', artist: 'y', answer, choices, source: 'deck' as const })
  expect(gradeGuess(card("Don't Stop"), "Don't stop believing")).toBe('close')
  expect(gradeGuess(card('1987'), '1986')).toBe('close')
  expect(gradeGuess(card('1987'), '1980')).toBe('wrong')
  expect(gradeGuess(card('Stairway to Heaven'), 'Stairway')).toBe('close')
  expect(gradeGuess(card('Stairway to Heaven'), 'Piano man')).toBe('wrong')
  expect(gradeGuess(card('Ladysmith Black Mambazo'), 'Ladysmith Mambazzo')).toBe('right')
  expect(gradeGuess(card('Ladysmith Black Mambazo'), 'Black')).toBe('close')
  expect(gradeGuess(card('Paul McCartney'), 'Paul')).toBe('close')
  expect(gradeGuess(card('Matt Bellamy', ['Dominic Howard', 'Matt Bellamy']), 'Matt Bellami')).toBe('right')
  expect(gradeGuess(card('Matt Bellamy', ['Dominic Howard', 'Matt Bellamy']), 'Matt')).toBe('wrong')
  expect(gradeGuess(card('Paul McCartney'), 'mccartney')).toBe('right')
})

test('hints give away a little more each time', async () => {
  const card = (answer: string, choices?: string[]) => ({ album: 'x', artist: 'y', answer, choices, source: 'deck' as const })
  expect(hintFor(card('Stairway to Heaven'), 1)).toBe('3 words, starting with "S".')
  expect(hintFor(card('Stairway to Heaven'), 2)).toBe('S_______ t_ H_____')
  expect(hintFor(card('1987'), 1)).toBe("It's in the 1980s.")
  expect(hintFor(card('1987'), 2)).toBe('It ends in 7.')
  expect(hintFor(card('1987'), 3)).toBeUndefined()
  expect(hintFor(card('B', ['A', 'B', 'C', 'D']), 1)).toContain('50/50')
  expect(hintFor(card('True', ['True', 'False']), 1)).toBeUndefined()
})

test('filters pick a decade or a genre', async () => {
  const album = { album: 'x', artist: 'y', year: 1987, genres: ['Hip Hop', 'Rap'], source: 'deck' as const }
  expect(parseFilter('80s')).toEqual({ kind: 'decade', from: 1980, label: '1980s' })
  expect(parseFilter("'90s")).toEqual({ kind: 'decade', from: 1990, label: '1990s' })
  expect(parseFilter('00s')).toEqual({ kind: 'decade', from: 2000, label: '2000s' })
  expect(matchesFilter(album, parseFilter('80s')!)).toBe(true)
  expect(matchesFilter(album, parseFilter('1970s')!)).toBe(false)
  expect(matchesFilter(album, parseFilter('hip-hop')!)).toBe(true)
  expect(matchesFilter(album, parseFilter('jazz')!)).toBe(false)
  expect(deckModule.DECK.every(c => c.genres?.length)).toBe(true)
})

test('Name That Tune keeps the artist\'s own songs and cleans titles', async () => {
  expect(cleanTrackName('Dreams (2004 Remaster)')).toBe('Dreams')
  expect(cleanTrackName('Rocks Off - Remastered 2010')).toBe('Rocks Off')
  const card = tuneCard([
    { trackName: 'Dreams (Karaoke Version)', artistName: 'Karaoke Kings', previewUrl: 'https://a/1.m4a' },
    { trackName: 'Dreams (2004 Remaster)', artistName: 'Fleetwood Mac', collectionName: 'Rumours', releaseDate: '1977-02-04', previewUrl: 'https://a/2.m4a', artworkUrl100: 'https://img/100x100bb.jpg' },
  ], 'Fleetwood Mac', 0)
  expect(card?.answer).toBe('Dreams')
  expect(card?.question).toContain('https://a/2.m4a')
  expect(card?.coverUrl).toBe('https://img/300x300bb.jpg')
  expect(card?.isCoverHidden).toBe(true)
})

test('a hint costs a point, and /trivia 80s plays only 80s albums', async ($, on) => {
  mock.store(on)
  await $.command.run({ command: 'score', args: 'reset' })
  const filtered = await $.command.run({ command: 'trivia', args: '80s' })
  expect(filtered?.text).toContain('Now playing albums from the 1980s')
  for (let i = 0; i < 6; i++) {
    const text = (await $.command.run({ command: 'next', args: '' }))?.text ?? ''
    const year = Number(/\((\d{4})\)/.exec(text)?.[1] ?? '1985')
    expect(year >= 1980 && year < 1990).toBe(true)
  }
  const hinted = await $.command.run({ command: 'hint', args: '' })
  expect(hinted?.text).toContain('💡')
  expect((await $.command.run({ command: 'score', args: '' }))?.text).toContain('Score: 0 (0 right')
  expect((await $.command.run({ command: 'trivia', args: 'all' }))?.text).toContain('Playing everything again')
})

test('/tune plays a preview and takes a guess at the song', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: 12345 })
  // The search answers with a song by whichever artist it was asked about.
  on('http.fetch', (_$, e) => {
    const term = decodeURIComponent(/term=([^&]+)/.exec(e.url)?.[1] ?? '')
    const songs = e.url.includes('itunes.apple.com')
      ? [{ trackName: 'Test Song (Remastered)', artistName: term, collectionName: 'An Album', releaseDate: '1972-05-12', previewUrl: 'https://p/song.m4a', trackViewUrl: 'https://music.apple.com/song/1' }]
      : []
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ results: songs }) } }
  })
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  const shown = (await $.command.run({ command: 'tune', args: '' }))?.text ?? ''
  expect(shown).toContain('🎧 Name that tune!')
  expect(shown).toContain('https://p/song.m4a')
  expect(shown).not.toContain('Test Song')
  const hinted = (await $.command.run({ command: 'hint', args: '' }))?.text ?? ''
  expect(hinted).toContain("Hint 1: It's by")
  const answered = (await $.command.run({ command: 'answer', args: 'test song' }))?.text ?? ''
  expect(answered).toContain('✅ Right! +5')
  expect(answered).toContain('"Test Song" by')
  expect(answered).toContain('https://music.apple.com/song/1')
  // The next card goes back to the rotation.
  expect((await $.command.run({ command: 'next', args: '' }))?.text).not.toContain('Name that tune')
})

test('Apple Music data makes album, artist and tracklist questions', async () => {
  const song = (trackName: string, collectionName: string, artistName = 'Fleetwood Mac') => ({ trackName, collectionName, artistName, collectionArtistName: artistName, primaryGenreName: 'Rock' })
  const results = [
    song('Dreams', 'Rumours (Super Deluxe Edition)'), song('Go Your Own Way', 'Rumours'), song('The Chain', 'Rumours'),
    song('Tusk', 'Tusk'), song('Sara', 'Tusk'), song('Big Love', 'Tango in the Night'), song('Little Lies', 'Tango in the Night'),
    song('Rhiannon', 'Fleetwood Mac'), song('Landslide', 'Fleetwood Mac'), song('Albatross', 'Then Play On'),
    song('Dreams', 'Greatest Hits'), song('Dreams (Karaoke)', 'Karaoke Hits', 'Karaoke Kings'),
  ]
  const cards = appleCards(results, 'Fleetwood Mac', peersOf('Fleetwood Mac'))
  expect(cleanAlbum('Rumours (Super Deluxe Edition)')).toBe('Rumours')
  expect(cleanAlbum('Red (Taylor\'s Version) [+ A Message from Taylor]')).toBe('Red')
  const album = cards.find(c => c.kind === 'apple-album' && c.question?.includes('"Dreams"'))
  if (album) {
    expect(album.answer).toBe('Rumours')
    expect(album.wrong).not.toContain('Greatest Hits')
    expect(album.isHeaderHidden).toBe(true)
  }
  expect(cards.some(c => c.kind === 'apple-artist')).toBe(true)
  // "Rhiannon" is on the self-titled album, which would give the artist away.
  expect(cards.some(c => c.kind === 'apple-artist' && c.question?.includes('"Rhiannon"'))).toBe(false)
  for (const c of cards) expect(c.choices ? c.choices.includes(c.answer!) : (c.wrong ?? []).every(w => w !== c.answer)).toBe(true)
  expect(peersOf('Nas')).toContain('Jay-Z')
})
