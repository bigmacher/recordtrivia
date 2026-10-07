# Record Trivia

[![Buy me a coffee](https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/jeffdwoskinshow)

Music trivia for people who spend their day in Claude Code. There are three separate things here:

| | What it is | Do you answer? | Points? |
| --- | --- | --- | --- |
| **1. Trivia while Claude works** | A box above the prompt shows a question, then the answer, while Claude is busy. | No, just play along in your head. | No |
| **2. The trivia game** | Type `/trivia` and play in the chat: reply with your answer and get scored. | Yes | Yes |
| **3. The web game** | A separate page on claude.ai, with a shared leaderboard. No install. | Yes, by tapping | Yes |

1 and 2 come together in one Claude Code mod. 3 is a web page you open from a link.

> **THIS IS FOR FUN. IF SOMETHING IS WRONG - SORRY - ENTERTAINMENT PURPOSES ONLY.**
>
> Questions are written by hand or built automatically from public music data, and some answers may be out of date or just plain wrong.

## Install the mod

You need [Claude Code](https://claude.com/claude-code) running in a terminal. The Claude desktop app's Code tab and the phone app can't install mods.

In a terminal:

```
claude plugin marketplace add bigmacher/recordtrivia
claude plugin install record-trivia@recordtrivia
```

Or inside Claude Code, one at a time:

```
/plugin marketplace add bigmacher/recordtrivia
/plugin install record-trivia@recordtrivia
```

Then start a new session with `claude`. The installer mentions settings that aren't set yet. They're all optional; see [Settings](#settings).

### Update

```
claude plugin marketplace update recordtrivia
claude plugin update record-trivia@recordtrivia
```

Then quit Claude Code (`/exit`) and start it again. A running session keeps the version it started with. `claude plugin list` shows which version you have.

If an update says you already have the latest version when you don't, reinstall. Your score is kept:

```
claude plugin uninstall record-trivia@recordtrivia
claude plugin marketplace update recordtrivia
claude plugin install record-trivia@recordtrivia
```

## 1. Trivia while Claude works

Nothing to type. Whenever Claude is busy with a task, a magenta box labeled **♫ RECORD TRIVIA** appears just above the prompt:

```
╭──────────────────────────────────────────────────────╮
│ ♫ RECORD TRIVIA · think fast                         │
│ ◉ Synchronicity — The Police (1983)                  │
│ Q: Which song from it became their biggest hit?      │
│    Roxanne · Every Breath You Take · Message in a …  │
╰──────────────────────────────────────────────────────╯
```

- The question shows for 15 seconds, then the answer and a fact for 15 seconds, then the next record.
- It disappears when Claude finishes.
- You don't answer it and it doesn't score. It's there to play along with while you wait.
- It's separate from the game: it never changes the card you're playing with `/trivia`.

Change the timing with the **Seconds per card** setting.

## 2. The trivia game

Type `/trivia` to get a card in the chat, then reply with your answer. Each reply is scored, and your running score shows on every card.

```
💿 Synchronicity — The Police (1983)

Q: Which song from it became their biggest hit?
   A. Don't Stand So Close to Me
   B. Message in a Bottle
   C. Roxanne
   D. Every Breath You Take

Reply with a letter, "hint" for a clue, "answer" to reveal it, or "next" to skip.

🏆 Score: 20 (2 right, 0 wrong)
```

### What you can reply

| Reply | What happens |
| --- | --- |
| Your answer, like `Every Breath You Take` or `1983` | Scored. Small typos are forgiven, and "McCartney" counts for Paul McCartney. |
| A letter, like `d` | Picks that option on a multiple-choice card. |
| `true` / `false` (or `yes` / `no`) | Answers a true-or-false card. |
| `hint` | A clue. Up to two per card. |
| `answer` or `I don't know` | Shows the answer without scoring. |
| `next` | Skips to another card. |
| `yes` (after an answer) | Next card. |
| `name that tune` | A Name That Tune round. |
| `restart trivia` | New game, score back to 0. |

Anything longer, or with a question mark, goes to Claude as normal, and the game steps aside until you ask for another card.

Card types are mixed: about 40% take a typed answer, 40% are multiple choice and 20% are true or false.

### Commands

| Command | What it does |
| --- | --- |
| `/trivia` | Show the current card. |
| `/next` | Next card. |
| `/answer` | Reveal the answer (`/answer <guess>` to guess). |
| `/hint` | Get a clue. |
| `/tune` | Name That Tune: tap the 30-second Apple Music preview link, then type the song title. Hint 1 names the artist. |
| `/score` | Your running score. |
| `/trivia 80s`, `/trivia hip hop`, `/trivia jazz` … | Play one decade or genre. `/trivia all` plays everything again. Your choice is remembered. |
| `/trivia restart` | New game, score back to 0. |
| `/trivia pane` | A side panel with a record drawing and Reveal (`r`), Next (`n`) and Refresh (`s`) buttons. Best on a terminal at least 110 columns wide. |

Every command runs straight away, even while Claude is busy.

### Scoring

| Result | Points |
| --- | --- |
| ✅ Right | +10 |
| ✅ Right after a hint | +5 |
| 🤏 Close: part of the answer, a near spelling, or a number off by one | −2 |
| ❌ Wrong | −5 |

Three right in a row starts a 🔥 streak. Your score is kept between sessions. Multiple-choice and true-or-false cards are only ever right or wrong.

Hints give the number of words and the first letter, then the blanks (`S_______ t_ H_____`). For a year, you get the decade, then the last digit. On multiple choice you get a 50/50, and on a tune you get the artist.

### Album covers

In the Claude app (phone, desktop or web), cards show the album cover as a picture. In a terminal, they show a link to it. When the question is about the cover itself, the cover waits until the answer.

## Where the questions come from

The mod (both parts 1 and 2) draws from:

| Source | How many | Kept where |
| --- | --- | --- |
| Hand-written classic albums, each with a fact and three believable wrong answers | 60 albums | `hooks/deck.ts` |
| [Open Trivia DB](https://opentdb.com) music questions | About 500, no repeats until all have been asked | Fetched while you play |
| Apple Music song data for 170 well-known artists: which album a song is on, who recorded a song, which song is on an album | About 13 per artist, so over 2,000 | Fetched a few artists at a time while you play |
| Wikipedia | A short summary and link for each album, shown after the answer | Fetched while you play |

So the 60 albums are only the hand-written part. When a session starts, the mod fetches a first batch of internet questions, and it fetches more as you play. Each album can also come up in a different format (typed, multiple choice or true/false). Release years aren't taken from Apple's data, since Apple often lists a reissue's date. Turn off the internet sources with the **Trivia from the internet** setting.

## Settings

All optional. Change them with `/plugin configure record-trivia@recordtrivia` inside Claude Code.

| Setting | Default | What it does |
| --- | --- | --- |
| Trivia from the internet | on | Open Trivia DB, Apple Music and Wikipedia questions. Off means only the 60 hand-written albums. |
| Points for a right answer | 10 | |
| Points for a right answer after a hint | 5 | |
| Points off for a close answer | 2 | |
| Points off for a wrong answer | 5 | |
| Seconds per card | 30 | How long each card shows above the prompt while Claude works: the question for the first half, the answer for the second. |

## 3. The web game

[Play Record Trivia](https://claude.ai/artifact/Q2ovgJvvBR1Gfjn2g82pPK)

A separate game you play in a browser, on a phone or a computer. You don't need the mod or Claude Code.

- 2,219 questions built into the page: the 60 hand-written albums plus Apple Music questions. Every card is multiple choice or true or false, so you play by tapping.
- A **Crate** menu to play one genre, a 50/50 hint, and a 🔥 streak.
- Scoring: +10 right, +5 after the hint, −5 wrong.
- **The Board**, a live leaderboard of the top 25 players with names and photos. Your score follows you to any device.

Everyone needs a Claude account to open it. The owner shares it from the page's **Share** menu. On a personal Claude account, only people invited **by email as Editors** can post to the board, and only while the page isn't shared by public link. Everyone else can play and watch, and their score stays on their own device.

## What the mod runs, fetches and stores

Claude Code shows a trust warning when you install a third-party mod. Here is everything this one does, so you can decide.

**Runs on your computer.** The mod runs as JavaScript inside Claude Code, with your user's permissions. The one outside program it starts is `curl`, to download album covers so the Claude app can draw them. The address comes from Apple's or Wikipedia's data and is passed as a plain argument, never as part of a command.

**Fetches from the internet,** only while "Trivia from the internet" is on:

| Site | What it asks for |
| --- | --- |
| `opentdb.com` | Music quiz questions |
| `itunes.apple.com` | Song lists for an artist, and Name That Tune previews |
| `en.wikipedia.org` | A short album summary and cover |
| `upload.wikimedia.org`, `is1-ssl.mzstatic.com` | Album cover images |

It sends nothing about you, your code or your files: only artist and album names in its searches.

**Reads your prompts.** Right after it shows you a trivia card, it reads your next message. If that message is a short reply (a guess, a letter, `hint`, `next`, `yes`), the mod answers it and Claude never sees it. Anything else passes through to Claude untouched, and the mod stops listening until you ask for another card.

**Shows card text in the chat.** Cards are slash-command output, so Claude can read them in the conversation, including question text that came from the sites above.

**Stores on your computer.** Your score, your decade or genre choice, and which artists and Open Trivia DB questions it has already used, so they don't repeat. Nothing is stored in this repository or sent anywhere.

## Credits and licenses

- The mod's code and the 60 hand-written albums are under the [MIT License](LICENSE).
- Questions from [Open Trivia DB](https://opentdb.com) are licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Cards from it are labeled "Open Trivia DB".
- Album summaries come from [Wikipedia](https://en.wikipedia.org) under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each one links to its article.
- Song data, previews and artwork come from the Apple [iTunes Search API](https://performance-partners.apple.com/search-api). Name That Tune links each song to Apple Music after the answer. Record Trivia isn't affiliated with or endorsed by Apple.
- Album covers belong to their artists and labels. The mod shows them while you play, and never stores them in this repository.

## Sharing the mod

Once this repository is public, anyone installs the mod with the two commands under [Install the mod](#install-the-mod). To share it with a few people while it's private, add them under the repository's **Settings → Collaborators**. Your scores and settings stay on your own computer; nothing private is stored in this repository.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

Bump `version` in `.claude-plugin/plugin.json` with every change, or `claude plugin update` won't see it.

### Project layout

| Path | What's in it |
| --- | --- |
| `.claude-plugin/` | The mod's manifest (`plugin.json`) and the marketplace file that makes this repository installable. |
| `hooks/register.tsx` | The mod: commands, chat replies, the box above the prompt, the side panel. |
| `hooks/deck.ts` | The 60 hand-written albums. Edit this to add your own questions. |
| `hooks/apple-quiz.ts` | Builds questions from Apple Music song data, and the list of artists it searches. |
| `hooks/web.ts` | Open Trivia DB and Wikipedia. |
| `hooks/guess.ts`, `hooks/hints.ts`, `hooks/variety.ts`, `hooks/filter.ts`, `hooks/tune.ts`, `hooks/covers.ts` | Guess checking, hints, card formats, decade and genre filters, Name That Tune, cover pictures. |
| `hooks/discogs.ts` | Questions from a Discogs record collection. Switched off for now. |
| `tests/trivia.test.ts` | Tests, run with `claude plugin test .`. |
| `web/` | The web game: `game.template.html` and the packed `record-trivia.html`, which holds all 2,219 questions. |
| `scripts/` | Builds the web game's question bank. |

### Rebuild the web game

After changing `hooks/deck.ts` or the artist list:

```
npx tsx scripts/build-bank.mts   # searches Apple Music for each artist (about 15 minutes; cached in .bank-cache/)
node scripts/pack-web.mjs        # writes web/record-trivia.html
```

Then publish `web/record-trivia.html` as an artifact on claude.ai.

## Support

If Record Trivia makes your waiting time more fun, you can [buy me a coffee](https://buymeacoffee.com/jeffdwoskinshow). ☕

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
