/** Longest a reply is read aloud; the rest is for the screen. */
export const SPEECH_MAX_CHARS = 600

/**
 * A reply's text as it should sound: code blocks become "（代码略）", markdown marks and links go,
 * and a long reply is cut at a sentence end with a note to read the rest on screen.
 */
export function speechText(markdown: string): string {
  let text = markdown
    .replace(/```[\s\S]*?(```|$)/g, '（代码略）')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~|]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。！？；：、（）])\s*/g, '$1')
    .trim()
  if (text.length <= SPEECH_MAX_CHARS) {
    return text
  }
  const head = text.slice(0, SPEECH_MAX_CHARS)
  const end = Math.max(
    ...['。', '！', '？', '. ', '! ', '? ', '；'].map((mark) => head.lastIndexOf(mark))
  )
  text = end > SPEECH_MAX_CHARS / 2 ? head.slice(0, end + 1) : head
  return `${text}……后面的内容请看屏幕。`
}

/** Splits text into pieces a vendor takes in one request, at sentence ends where it can. */
export function speechPieces(text: string, max = 280): string[] {
  const pieces: string[] = []
  let rest = text
  while (rest.length > max) {
    const head = rest.slice(0, max)
    const end = Math.max(
      ...['。', '！', '？', '；', '，', '. ', ', '].map((mark) => head.lastIndexOf(mark))
    )
    const cut = end > max / 3 ? end + 1 : max
    pieces.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut)
  }
  if (rest.trim()) {
    pieces.push(rest.trim())
  }
  return pieces
}
