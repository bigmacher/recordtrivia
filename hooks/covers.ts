// Covers travel inside an SVG so the phone and desktop apps, which draw SVG but
// no bitmap element, can show them. The SVG source is held to 131,072 characters.
export const MAX_COVER_BASE64 = 120_000
export const COVER_PX = 240

// Asks Wikimedia for a 250px thumbnail instead of the full-size upload.
export function wikimediaThumb(url: string): string {
  const m = /^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+\/)([0-9a-f]\/[0-9a-f]{2}\/)([^/]+)$/.exec(url)
  if (!m) return url
  const [, base, hashPath, file] = m

  return `${base}thumb/${hashPath}${file}/250px-${file}`
}

export function mimeOf(base64: string): string | undefined {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('R0lG')) return 'image/gif'
  if (base64.startsWith('UklG')) return 'image/webp'
  return undefined
}

export function coverSvg(base64: string): string | undefined {
  const mime = mimeOf(base64)
  if (!mime || base64.length > MAX_COVER_BASE64) return undefined

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${COVER_PX}" height="${COVER_PX}" viewBox="0 0 ${COVER_PX} ${COVER_PX}">`
    + `<image width="${COVER_PX}" height="${COVER_PX}" preserveAspectRatio="xMidYMid meet" href="data:${mime};base64,${base64}" xlink:href="data:${mime};base64,${base64}"/>`
    + '</svg>'
}

const COVER_LINE = /^🖼️ Cover: (\S+)$/m

export function coverLineOf(text: string): string | undefined {
  return COVER_LINE.exec(text)?.[1]
}

export function withoutCoverLine(text: string): string {
  return text.replace(/^🖼️ Cover: \S+\n?/m, '')
}
