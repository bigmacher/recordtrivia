# Changelog

## 0.5.3

- Rename a variable named `h` in `hooks/register.tsx`, which the directory reserves for JSX.

## 0.5.2

- Screenshots of the trivia box and the web game in the README.
- A Buy Me a Coffee link: a Sponsor button on GitHub (`.github/FUNDING.yml`), a README badge and Support section, and a link in the web game's footer.
- Fix: the card you are answering no longer changes when new quiz or Apple Music questions arrive in the background. Your guess is graded against the card you saw.
- Fix: a short request to Claude right after a card, like "run the tests" or "commit and push", goes to Claude instead of being graded as a guess. "ok", "sure" and "help" go to Claude too; reply "yes" for the next card and "hint" for a clue.

## 0.5.1

- A for-fun disclaimer in the README, in `/score`, and on the web game.
- Contact email jeff@jeffisfunny.com in the mod and marketplace files.

## 0.5.0

- MIT license, plus `license`, `homepage`, `repository` and `keywords` in `plugin.json`.
- README: a section on everything the mod runs, fetches, reads and stores, and credits for the data sources and their licenses.
- Name That Tune links each song to Apple Music after the answer.

## 0.4.0

- Discogs collections are switched off for now: their settings are gone, and the `/trivia pane` button that synced them is now **Refresh**, which fetches more internet questions.
- README reorganized around the three separate things: trivia while Claude works (watch along, no points), the `/trivia` game (answer and score), and the web game. It now also says where every question comes from and how many there are.

## 0.3.0

- Cards above the prompt now show the question for 15 seconds, then the answer for 15 seconds (a 30-second card, up from 20).
- README rewritten for everything below. The marketplace file now has a description.

## 0.2.0

- The strip above the prompt sits in a magenta rounded box labeled ♫ RECORD TRIVIA.
- Replying to a card in the chat (a letter, `next`, `hint`, `yes`) answers straight away. It used to fail with "no command.run hook answered it".
- The version number now changes with each release, so `claude plugin update` picks it up.

## 0.1.0

The first version, built up over a series of changes:

- Trivia above the prompt while Claude works, and a `/trivia pane` side panel.
- A scored game in the chat: `/trivia`, `/answer`, `/next`, `/score`, plain replies, and `restart trivia`.
- Card formats: typed answer, multiple choice, and true or false.
- Scoring: +10 right, +5 after a hint, −2 close, −5 wrong, with a 🔥 streak. The score is shown on every card and kept between sessions.
- Hints, decade and genre filters (`/trivia 80s`), and Name That Tune (`/tune`).
- Questions from 60 hand-written albums, Apple Music song data, Open Trivia DB and Wikipedia (and, until 0.4.0, an optional Discogs collection).
- Album covers drawn as pictures in the Claude app.
- The web game, with 2,219 questions and a shared leaderboard.
