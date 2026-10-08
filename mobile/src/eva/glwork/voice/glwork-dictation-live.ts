/** The words a cloud recognizer has so far, for the overlay above the composer (empty when idle). */
let live = ''
const listeners = new Set<(text: string) => void>()

export function setGlWorkDictationLive(text: string): void {
  live = text
  for (const listener of listeners) {
    listener(text)
  }
}

export function glWorkDictationLive(): string {
  return live
}

export function subscribeGlWorkDictationLive(listener: (text: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
