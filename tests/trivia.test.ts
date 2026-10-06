import { expect, test } from 'claude-code/testing'

import { cardsFromPage, cleanName, enrichCard } from '../hooks/discogs'
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
    },
  }],
}

test('builds a trivia card from a Discogs collection item', async () => {
  const [card] = cardsFromPage(PAGE)
  expect(card?.album).toBe('Never Gonna Give You Up')
  expect(card?.artist).toBe('Rick Astley')
  expect(card?.url).toBe('https://www.discogs.com/release/249504')
  expect(card?.fact).toBe('Your copy: Vinyl, 7", Single, 45 RPM on RCA')
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
    expect(await ui.find({ type: 'Text', text: /^A:/ })).toBeUndefined()
    await ui.press({ key: 'reveal' })
    expect(await ui.find({ type: 'Text', text: /^A:/ })).toBeDefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /^A:/ })).toBeUndefined()
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
  })
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
  expect(shown?.text).toContain('/trivia answer')
  const answered = await $.command.run({ command: 'trivia', args: 'answer' })
  expect(answered?.text).toContain('/trivia next')
})
