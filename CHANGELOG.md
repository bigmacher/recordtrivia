# Changelog

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
- Questions from 60 hand-written albums, Apple Music song data, Open Trivia DB, Wikipedia, and an optional Discogs collection.
- Album covers drawn as pictures in the Claude app.
- The web game, with 2,219 questions and a shared leaderboard.
