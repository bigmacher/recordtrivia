# Record Trivia

Record and music trivia, two ways:

- **The Claude Code mod** puts a trivia card above the prompt while Claude works, and runs a scored trivia game right in the chat.
- **The web game** is a single page on claude.ai with over 2,000 questions and a shared leaderboard. People play it on a phone or computer, with no install.

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

Then start a new session with `claude` and type `/trivia`.

The installer mentions settings that aren't set yet. They're all optional; see [Settings](#settings).

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

## What the mod does

### While Claude works

When Claude is busy with a task, a magenta box labeled **♫ RECORD TRIVIA** appears just above the prompt with an album and a question. After 15 seconds it shows the answer and a fact, and 15 seconds later it moves to the next record. It disappears when Claude finishes. This strip is for watching: it doesn't score, and it never moves the card you're playing in the chat.

### Playing in the chat

Type `/trivia` for a card, then just reply:

| Reply | What happens |
| --- | --- |
| Your guess, like `Every Breath You Take` or `1983` | Scored. Small typos are forgiven, and "McCartney" counts for Paul McCartney. |
| A letter, like `b` | Picks that option on a multiple-choice card. |
| `true` / `false` (or `yes` / `no`) | Answers a true-or-false card. |
| `hint` | A clue. Up to two per card. |
| `answer` or `I don't know` | Shows the answer without scoring. |
| `next` | Skips to another record. |
| `yes` (after an answer) | Next record. |
| `name that tune` | A Name That Tune round. |
| `restart trivia` | New game, score back to 0. |

Anything longer, or with a question mark, goes to Claude as normal.

Card types are mixed: about 40% take a typed answer, 40% are multiple choice and 20% are true or false.

### Commands

| Command | What it does |
| --- | --- |
| `/trivia` | Show the current card. |
| `/next` | Next record. |
| `/answer` | Reveal the answer (`/answer <guess>` to guess). |
| `/hint` | Get a clue. |
| `/tune` | Name That Tune: tap the 30-second Apple Music preview link, then type the song title. Hint 1 names the artist. |
| `/score` | Your running score. |
| `/trivia 80s`, `/trivia hip hop`, `/trivia jazz` … | Play one decade or genre. `/trivia all` plays everything again. Your choice is remembered. |
| `/trivia restart` | New game, score back to 0. |
| `/trivia pane` | A side panel with a record drawing and Reveal (`r`), Next (`n`) and Sync (`s`) buttons. Best on a terminal at least 110 columns wide. |

Every command runs straight away, even while Claude is busy.

### Scoring

| Result | Points |
| --- | --- |
| ✅ Right | +10 |
| ✅ Right after a hint | +5 |
| 🤏 Close: part of the answer, a near spelling, or a number off by one | −2 |
| ❌ Wrong | −5 |

Three right in a row starts a 🔥 streak. Every card shows your score, and it's kept between sessions. Multiple-choice and true-or-false cards are only ever right or wrong.

Hints give the number of words and the first letter, then the blanks (`S_______ t_ H_____`). For a year, you get the decade, then the last digit. On multiple choice you get a 50/50, and on a tune you get the artist.

### Where the questions come from

- **60 hand-written classic albums**, each with a fact and three believable wrong answers.
- **Apple Music song data** for 170 well-known artists: which album a song is on, who recorded a song, and which song is on an album. Wrong artists come from the same genre. Release years aren't taken from this data, since Apple often lists a reissue's date.
- **[Open Trivia DB](https://opentdb.com)**: all of its roughly 500 music questions, with no repeats until every one has been asked.
- **Wikipedia**: a short summary and a link for each album, after the answer.
- **Your Discogs collection**, if you connect it: up to 1,000 of your records, with questions on year, label, genre, opening track, track count, how many Discogs users own that pressing, and when you added it.

### Album covers

In the Claude app (phone, desktop or web), cards show the album cover as a picture. In a terminal, they show a link to it. When the question is about the cover itself, the cover waits until the answer.

### Settings

All optional. Change them with `/plugin configure record-trivia@recordtrivia` inside Claude Code.

| Setting | Default | What it does |
| --- | --- | --- |
| Discogs username | none | Build questions from your Discogs collection. |
| Discogs personal access token | none | Needed if your collection is private. On Discogs: **Settings → Developers → Generate new token**. Stored as a secret. |
| Trivia from the internet | on | Open Trivia DB, Apple Music and Wikipedia questions. |
| Points for a right answer | 10 | |
| Points for a right answer after a hint | 5 | |
| Points off for a close answer | 2 | |
| Points off for a wrong answer | 5 | |
| Seconds per card | 30 | How long each card shows above the prompt: the question for the first half, the answer for the second. |

Settings stay on your computer. Nothing private is stored in this repository.

## The web game

[Play Record Trivia](https://claude.ai/artifact/Q2ovgJvvBR1Gfjn2g82pPK)

- 2,219 multiple-choice and true-or-false questions: the hand-written albums plus Apple Music questions.
- A **Crate** menu to play one genre, a 50/50 hint, and a 🔥 streak.
- Scoring: +10 right, +5 after the hint, −5 wrong.
- **The Board**, a live leaderboard of the top 25 players with names and photos. Your score follows you to any device.

Everyone needs a Claude account to open it. The owner shares it from the page's **Share** menu. On a personal Claude account, only people invited **by email as Editors** can post to the board, and only while the page isn't shared by public link. Everyone else can play and watch, and their score stays on their own device.

## Sharing the mod

Once this repository is public, anyone installs the mod with the two commands under [Install the mod](#install-the-mod). To share it with a few people while it's private, add them under the repository's **Settings → Collaborators**.

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
| `hooks/register.tsx` | The mod: commands, chat replies, the strip above the prompt, the side panel. |
| `hooks/deck.ts` | The 60 hand-written albums. |
| `hooks/apple-quiz.ts` | Builds questions from Apple Music song data. |
| `hooks/discogs.ts`, `hooks/web.ts` | Discogs, Open Trivia DB and Wikipedia. |
| `hooks/guess.ts`, `hooks/hints.ts`, `hooks/variety.ts`, `hooks/filter.ts`, `hooks/tune.ts`, `hooks/covers.ts` | Guess checking, hints, card formats, decade and genre filters, Name That Tune, cover pictures. |
| `tests/trivia.test.ts` | Tests, run with `claude plugin test .`. |
| `web/` | The web game: `game.template.html` and the packed `record-trivia.html`. |
| `scripts/` | Builds the web game's question bank. |

### Rebuild the web game

```
npx tsx scripts/build-bank.mts   # searches Apple Music for each artist (about 15 minutes; cached in .bank-cache/)
node scripts/pack-web.mjs        # writes web/record-trivia.html
```

Then publish `web/record-trivia.html` as an artifact on claude.ai.

## Changes

See [CHANGELOG.md](CHANGELOG.md).
