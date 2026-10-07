# Record Trivia

Record and music trivia, two ways:

- **Web game** (`web/record-trivia.html`, published on claude.ai): thousands of multiple-choice questions and a shared leaderboard. Anyone you share the link with can play on a phone or computer, with no install.
- **Claude Code mod** (this folder): trivia cards in the chat and above the prompt while Claude works.

- **While Claude is working**, a band above the prompt shows an album, a trivia question, and then reveals the answer and a fact halfway through each card.
- **`/trivia`** prints a trivia card right in the chat, so it works on a phone too. Type **`/answer`** to reveal it and **`/next`** for another record. `/trivia pane` opens the side panel in a terminal, which has **Reveal** (`r`), **Next record** (`n`) and **Sync** (`s`) buttons. All of these run instantly, even while Claude is busy.
- **Your Discogs collection:** the mod pulls your records from Discogs and builds questions from them: release year, label and catalog number, genre and style, the opening track, how many tracks, how many Discogs users own that pressing, and when you added it. Each card links to the release page on Discogs.

- **Trivia from the internet:** every other card (every third once your Discogs collection is synced) is a music question from [Open Trivia DB](https://opentdb.com). It works through all ~500 of their music questions without repeats, then starts over. Album cards also get a short summary from Wikipedia, with a link to the full article. You can turn this off with the **Trivia from the internet** setting.

- **Album covers:** in the Claude app (phone, desktop or web), the card shows the album cover as a picture. It comes from your Discogs release or the album's Wikipedia page, and is downloaded with `curl`. When the question is about the cover itself, the picture waits until you type `/answer`. In a terminal, the card shows a link to the cover instead.

- **Just reply:** after a question, type your guess (an album name, a year, or a letter for multiple choice). Small typos are forgiven. Reply "answer" or "I don't know" to see the answer without scoring, and "next" to skip. After an answer, reply "yes" for the next record. Longer messages and questions still go to Claude.
- **Mixed formats:** about 40% of album cards are multiple choice, 20% are true or false, and the rest take a typed answer. On a multiple-choice card reply with the letter, and on a true-or-false card reply true/false or yes/no.
- **Hints:** reply "hint" (or `/hint`) for a clue, up to two per card. A right answer after a hint earns 5 points instead of 10. You get the number of words and the first letter, the decade, or a 50/50 on multiple choice.
- **Pick a decade or genre:** `/trivia 80s`, `/trivia 1990s`, `/trivia hip hop`, `/trivia jazz`, and so on. `/trivia all` plays everything again. Your choice is remembered.
- **Name that tune:** `/tune` (or reply "name that tune") plays a 30-second preview from Apple Music. Tap the link to listen, then type the song title. Hint 1 tells you the artist.
- **Running score:** +10 for a right guess, −2 for a close one (a year off by one, part of the answer, or a near spelling), −5 for a wrong one, with a 🔥 streak after three right in a row. The score is kept between sessions. `/score` shows it. Reply "restart trivia" (or type `/trivia restart`) for a new game with the score back at 0. Change the points in `/config`.

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

The mod reads up to 1,000 records, re-syncs every 30 minutes, and has a **Sync Discogs** button in the `/trivia` pane. With no username set, it uses its built-in deck of 60 classic albums.

## Web game

The game page is one self-contained HTML file with the question bank built in. Each player's score is saved under their own entry on the shared board, so it follows them to other devices. On a personal Claude account, only people you invite **by email as Editors** can post to the board, and only while the page isn't shared by public link. Everyone else can still play and watch, and their score stays on their own device.

Rebuild the question bank and the page:

```
npx tsx scripts/build-bank.mts   # searches Apple Music for each artist (about 15 minutes; cached in .bank-cache/)
node scripts/pack-web.mjs        # writes web/record-trivia.html
```

The bank combines the 60 hand-written albums with questions generated from Apple Music song data: which album a song is on, who recorded a song, and which song is on an album. Release years are not taken from Apple's data, since it often lists a reissue's date.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```
