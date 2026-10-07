// Packs web/bank.json into the game page: web/game.template.html → web/record-trivia.html.
// Run after build-bank: node scripts/pack-web.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const bank = JSON.parse(readFileSync(new URL('../web/bank.json', import.meta.url), 'utf8'))
const compact = bank
  .filter(c => c.question && c.answer && (c.choices?.length || c.wrong?.length >= 3))
  .map(c => {
    const e = { q: c.question, a: c.answer, al: c.album, ar: c.artist }
    if (c.choices) e.c = c.choices
    else e.w = c.wrong.slice(0, 3)
    if (c.year) e.y = c.year
    if (c.fact) e.f = c.fact
    if (c.genres?.length) e.g = c.genres
    if (c.isHeaderHidden) e.h = 1
    return e
  })
const template = readFileSync(new URL('../web/game.template.html', import.meta.url), 'utf8')
// Escape "<" so no question text can close the script element.
const json = JSON.stringify(compact).replace(/</g, '\\u003c')
writeFileSync(new URL('../web/record-trivia.html', import.meta.url), template.replace('/*__BANK__*/[]', json))
console.log(`packed ${compact.length} questions`)
