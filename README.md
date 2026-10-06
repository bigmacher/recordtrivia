# Record Trivia

A Claude Code mod that spins record and music trivia while Claude works.

- **While Claude is working**, a band above the prompt shows an album, a trivia question, and then reveals the answer and a fact halfway through each card.
- **`/trivia`** opens a pane with a little vinyl record, plus **Reveal** (`r`), **Next record** (`n`) and **Sync Discord** (`s`) buttons.
- **Discord feed (optional):** the mod reads your trivia channel every minute and puts new cards at the front of the deck.

## Install

```
/plugin install record-trivia --marketplace bigmacher/recordtrivia
```

Answer `y` to add the marketplace, then pick a scope.

## Hooking up Discord

1. Create an application at <https://discord.com/developers/applications>. Add a **Bot**, turn on **Message Content Intent**, and copy the bot token.
2. Invite the bot to your server with the **View Channel** and **Read Message History** permissions.
3. Right-click your trivia channel and choose **Copy Channel ID**. You need Developer Mode on to see that option.
4. In Claude Code, open `/config` and fill in the **record-trivia** rows: the bot token (stored as a secret), the channel ID and the seconds per card.

Post trivia in the channel using either format:

```
!trivia Rumours | Fleetwood Mac | 1977 | Recorded while both couples in the band were breaking up.
!q Who produced Thriller? | Quincy Jones
```

Messages in any other format are ignored. With no Discord set up, the mod uses its built-in deck of 28 classic albums.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
