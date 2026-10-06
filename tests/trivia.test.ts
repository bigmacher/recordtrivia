import { expect, test } from 'claude-code/testing'

import { parseMessage, parseMessages } from '../hooks/discord'

const SCROLL = { offset: 0, bodyRows: 10 }

test('parses !trivia album facts from Discord', async () => {
  expect(parseMessage('!trivia Abbey Road | The Beatles | 1969 | Shot in ten minutes')).toEqual({
    album: 'Abbey Road',
    artist: 'The Beatles',
    year: 1969,
    fact: 'Shot in ten minutes',
    source: 'discord',
  })
})

test('parses !q quiz questions and ignores chatter', async () => {
  const cards = parseMessages([
    { content: 'anyone up for trivia?' },
    { content: '!q Who sang Purple Rain? | Prince' },
    { content: '!q missing answer' },
  ])
  expect(cards.length).toBe(1)
  expect(cards[0]?.answer).toBe('Prince')
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
