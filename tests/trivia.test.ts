import { expect, test } from 'claude-code/testing'

import { cardsFromPage, cleanName, enrichCard } from '../hooks/discogs'

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
