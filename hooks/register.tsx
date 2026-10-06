import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Trivia } from '../types'
import { DECK } from './deck'
import { parseMessages } from './discord'
import type { DiscordMessage } from './discord'

const PANE = 'record-trivia'
const POLL_MS = 60_000

const index = atom({ plugin: 'record-trivia', key: 'index' } as const, 0)
const isRevealed = atom({ plugin: 'record-trivia', key: 'isRevealed' } as const, false)
const fromDiscord = atom({ plugin: 'record-trivia', key: 'fromDiscord' } as const, [])
const discordStatus = atom({ plugin: 'record-trivia', key: 'discordStatus' } as const, 'off')

// Discord cards first so fresh community trivia shows up soon after it is posted.
async function currentCard($: EngineInterface): Promise<{ card: Trivia; total: number }> {
  const deck = [...(await read($, fromDiscord)), ...DECK]
  const i = (await read($, index)) % deck.length

  return { card: deck[i] ?? DECK[0]!, total: deck.length }
}

async function nextCard($: EngineInterface) {
  await update($, isRevealed, () => false)
  await update($, index, i => i + 1)
}

async function pullDiscord($: EngineInterface, token: string, channelId: string) {
  if (!token || !channelId) {
    await update($, discordStatus, () => 'off')
    return
  }
  try {
    const res = await $.http.fetch(
      `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=100`,
      { headers: { Authorization: `Bot ${token}`, 'User-Agent': 'record-trivia (claude-code mod, 0.1.0)' } },
    )
    if (!res.ok) {
      await update($, discordStatus, () => `error ${res.status}`)
      return
    }
    const cards = parseMessages(JSON.parse(res.text) as DiscordMessage[])
    await update($, fromDiscord, () => cards)
    await update($, discordStatus, () => `${cards.length} from Discord`)
  } catch {
    await update($, discordStatus, () => 'unreachable')
  }
}

export const register: Register = (on, options) => {
  const token = String(options.discordBotToken ?? '').trim()
  const channelId = String(options.discordChannelId ?? '').trim()
  const halfMs = Math.max(5, Number(options.rotateSeconds ?? 20)) * 500

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'trivia',
      description: 'Open the record trivia pane',
    })
    // Start somewhere different each session.
    const now = await $.clock.now()
    await update($, index, () => now % 1000)
    void pullDiscord($, token, channelId)
    $.clock.every(POLL_MS, () => void pullDiscord($, token, channelId))
    // Flip the card to its answer, then advance, on a steady beat.
    $.clock.every(halfMs, () => {
      void (async () => {
        if (await read($, isRevealed)) await nextCard($)
        else await update($, isRevealed, () => true)
      })()
    })

    return next(e)
  })

  // A fresh card each time Claude starts working.
  on('turn.start', async ($, e, next) => {
    await nextCard($)

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
    const { Box, Text, Button } = $.ui.resolve(e)
    const { card, total } = await currentCard($)
    const revealed = await read($, isRevealed)
    const status = await read($, discordStatus)
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
            {card.artist ? <Text>{card.artist}</Text> : null}
            {card.year ? <Text dimColor>{String(card.year)}</Text> : null}
            <Text dimColor>{card.source === 'discord' ? 'from Discord' : 'from the crate'}</Text>
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
          <Button key="next" label="Next record" hotkey="n" onPress={() => nextCard($)} />
          <Button key="sync" label="Sync Discord" hotkey="s" onPress={() => pullDiscord($, token, channelId)} />
        </Box>
        <Text dimColor>{total} cards · Discord: {status}</Text>
      </Box>
    )
  })
}
