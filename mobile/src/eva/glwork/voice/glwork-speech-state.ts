/**
 * Whether GL Work is reading aloud, and how to stop it — without the audio modules, so the screens
 * and Orca components that show or stop a reading can import it (and their tests load it).
 */
let speaking = false
let stopper: (() => void) | null = null
const listeners = new Set<(speaking: boolean) => void>()

export function setGlWorkSpeaking(next: boolean): void {
  speaking = next
  for (const listener of listeners) {
    listener(next)
  }
}

export function isGlWorkSpeaking(): boolean {
  return speaking
}

export function subscribeGlWorkSpeaking(listener: (speaking: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The player registers how to stop it once it has loaded. */
export function registerGlWorkSpeechStopper(stop: () => void): void {
  stopper = stop
}

export function stopGlWorkSpeech(): void {
  stopper?.()
  setGlWorkSpeaking(false)
}
