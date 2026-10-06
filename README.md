# Record Trivia

A Claude Code mod that spins record and music trivia while Claude works.

- **While Claude is working**, a band above the prompt shows an album, a trivia question, and then reveals the answer and a fact halfway through each card.
- **`/trivia`** prints a trivia card right in the chat, so it works on a phone too. Type **`/answer`** to reveal it and **`/next`** for another record. `/trivia pane` opens the side panel in a terminal, which has **Reveal** (`r`), **Next record** (`n`) and **Sync** (`s`) buttons. All of these run instantly, even while Claude is busy.
- **Your Discogs collection:** the mod pulls your records from Discogs and builds questions from them: release year, label and catalog number, genre and style, the opening track, how many tracks, how many Discogs users own that pressing, and when you added it. Each card links to the release page on Discogs.

- **Trivia from the internet:** every third card is a multiple-choice music question from [Open Trivia DB](https://opentdb.com). Album cards also get a short summary from Wikipedia, with a link to the full article. You can turn this off with the **Trivia from the internet** setting.

- **Album covers:** in the Claude app (phone, desktop or web), the card shows the album cover as a picture. It comes from your Discogs release or the album's Wikipedia page, and is downloaded with `curl`. When the question is about the cover itself, the picture waits until you type `/answer`. In a terminal, the card shows a link to the cover instead.

## Install

```
/plugin install record-trivia --marketplace bigmacher/recordtrivia
```

Answer `y` to add the marketplace, then pick a scope.

## Hooking up Discogs

1. In Claude Code, open `/config` and find the **record-trivia** rows.
2. Enter your **Discogs username**.
3. If your collection is private, also add a **personal access token**: on Discogs, go to **Settings → Developers → Generate new token**. It's stored as a secret.
4. Optionally change **Seconds per card** (default 20).

The mod reads up to 1,000 records, re-syncs every 30 minutes, and has a **Sync Discogs** button in the `/trivia` pane. With no username set, it uses its built-in deck of 28 classic albums.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
