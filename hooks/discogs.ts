import type { Trivia } from '../types'

// The parts of the Discogs API responses the mod reads.
type Named = { name?: string }
type Format = { name?: string; descriptions?: string[] }
type Label = { name?: string; catno?: string }

export type BasicInformation = {
  id: number
  title?: string
  year?: number
  artists?: Named[]
  labels?: Label[]
  formats?: Format[]
  genres?: string[]
  styles?: string[]
  cover_image?: string
  thumb?: string
}

export type CollectionPage = {
  pagination?: { page?: number; pages?: number }
  releases?: { date_added?: string; basic_information?: BasicInformation }[]
}

export type Release = {
  id: number
  tracklist?: { title?: string; type_?: string }[]
  community?: { have?: number; want?: number }
  lowest_price?: number | null
  num_for_sale?: number
}

// Discogs disambiguates artists as "Prince (2)" and marks name variations with "*".
export function cleanName(name: string): string {
  return name.replace(/\s\(\d+\)$/, '').replace(/\*$/, '').trim()
}

function artistOf(info: BasicInformation): string {
  return (info.artists ?? []).map(a => cleanName(a.name ?? '')).filter(Boolean).join(' & ') || 'Unknown artist'
}

function formatOf(info: BasicInformation): string {
  const format = info.formats?.[0]
  return [format?.name, ...(format?.descriptions ?? [])].filter(Boolean).join(', ')
}

type Ask = { question: string; answer: string; kind: string; wrong?: string[] }

function pick<T>(choices: T[], seed: number): T | undefined {
  return choices.length ? choices[Math.abs(seed) % choices.length] : undefined
}

export function cardFromCollection(info: BasicInformation, dateAdded?: string): Trivia {
  const album = info.title ?? 'Untitled'
  const artist = artistOf(info)
  const year = info.year && info.year > 0 ? info.year : undefined
  const label = info.labels?.[0]
  const labelName = label?.name ? cleanName(label.name) : undefined
  const styles = [...(info.styles ?? []), ...(info.genres ?? [])]
  const format = formatOf(info)
  const added = dateAdded?.slice(0, 10)

  const asks: Ask[] = []
  if (year) asks.push({ question: `What year did ${artist} release "${album}"?`, answer: String(year), kind: 'year' })
  if (labelName) asks.push({ question: `Which label put out "${album}"?`, answer: labelName, kind: 'label' })
  if (styles.length) asks.push({ question: `How is "${album}" filed on Discogs (genre/style)?`, answer: styles.slice(0, 2).join(', '), kind: 'style' })
  if (added) asks.push({ question: `When did "${album}" join your collection?`, answer: added, kind: 'added' })
  const ask = pick(asks, info.id)

  const facts = [format && `Your copy: ${format}`, labelName && `on ${labelName}${label?.catno ? ` (${label.catno})` : ''}`].filter(Boolean)

  return {
    album,
    artist,
    year,
    fact: facts.join(' ') || undefined,
    question: ask?.question,
    answer: ask?.answer,
    kind: ask?.kind,
    isYearHidden: ask?.kind === 'year',
    genres: styles,
    source: 'discogs',
    releaseId: info.id,
    url: `https://www.discogs.com/release/${info.id}`,
    coverUrl: info.cover_image && !info.cover_image.includes('spacer.gif') ? info.cover_image : undefined,
    coverThumbUrl: info.thumb && !info.thumb.includes('spacer.gif') ? info.thumb : undefined,
  }
}

export function cardsFromPage(page: CollectionPage): Trivia[] {
  const out: Trivia[] = []
  for (const item of page.releases ?? []) {
    if (item.basic_information) out.push(cardFromCollection(item.basic_information, item.date_added))
  }
  return out
}

// Adds what only the full release record knows: tracklist and the community's numbers.
export function enrichCard(card: Trivia, release: Release): Trivia {
  const tracks = (release.tracklist ?? []).filter(t => (t.type_ ?? 'track') === 'track' && t.title)
  const have = release.community?.have
  const want = release.community?.want

  const asks: Ask[] = []
  if (tracks[0]?.title) asks.push({
    question: `What's the opening track on "${card.album}"?`,
    answer: tracks[0].title,
    kind: 'track',
    wrong: tracks.slice(1).map(t => t.title!).filter(t => t !== tracks[0]!.title).slice(0, 3),
  })
  if (tracks.length > 1) asks.push({ question: `How many tracks are on "${card.album}"?`, answer: String(tracks.length), kind: 'count' })
  if (have) asks.push({ question: `How many Discogs users have "${card.album}" (this pressing) in their collection?`, answer: have.toLocaleString('en-US'), kind: 'have' })
  const ask = pick(asks, (card.releaseId ?? 0) >> 1)

  const facts = [
    card.fact,
    have !== undefined && want !== undefined && `${have.toLocaleString('en-US')} have it, ${want.toLocaleString('en-US')} want it`,
    release.lowest_price ? `lowest price on the market: ${release.lowest_price.toFixed(2)}` : undefined,
  ].filter(Boolean)

  return {
    ...card,
    question: ask?.question ?? card.question,
    answer: ask?.answer ?? card.answer,
    kind: ask ? ask.kind : card.kind,
    wrong: ask ? ask.wrong : card.wrong,
    isYearHidden: ask ? false : card.isYearHidden,
    fact: facts.join(' · ') || card.fact,
    isEnriched: true,
  }
}
