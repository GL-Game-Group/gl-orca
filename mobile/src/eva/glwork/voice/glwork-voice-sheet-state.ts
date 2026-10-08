/** Whether the session screen's voice sheet is open (opened from the header's "…" actions). */
let open = false
const listeners = new Set<(open: boolean) => void>()

export function setGlWorkVoiceSheetOpen(next: boolean): void {
  open = next
  listeners.forEach((listener) => listener(open))
}

export function isGlWorkVoiceSheetOpen(): boolean {
  return open
}

export function subscribeGlWorkVoiceSheet(listener: (open: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
