/**
 * Where a hold-to-talk finger is, WeChat style: over the button it sends, slid left it cancels,
 * slid right it opens what was heard in the keyboard for editing.
 */
export type HoldToTalkZone = 'send' | 'cancel' | 'edit'

/** How far, as a share of the screen's width (but at least this many points), counts as slid. */
const SLIDE_SHARE = 0.18
const SLIDE_MIN = 56

export function holdToTalkZone(dx: number, screenWidth: number): HoldToTalkZone {
  const threshold = Math.max(SLIDE_MIN, screenWidth * SLIDE_SHARE)
  if (dx <= -threshold) {
    return 'cancel'
  }
  if (dx >= threshold) {
    return 'edit'
  }
  return 'send'
}

/** Shorter than this is a tap, not a hold: nothing is sent and the member is told to hold. */
export const HOLD_TO_TALK_MIN_MS = 500

export type HoldToTalkRelease =
  | { kind: 'too-short' }
  | { kind: 'cancel' }
  | { kind: 'empty' }
  | { kind: 'send'; text: string }
  | { kind: 'edit'; text: string }

/** What letting go does, from where the finger was, how long it held, and what was heard. */
export function holdToTalkRelease(
  zone: HoldToTalkZone,
  heldMs: number,
  text: string
): HoldToTalkRelease {
  if (zone === 'cancel') {
    return { kind: 'cancel' }
  }
  if (heldMs < HOLD_TO_TALK_MIN_MS) {
    return { kind: 'too-short' }
  }
  const heard = text.trim()
  if (zone === 'edit') {
    return { kind: 'edit', text: heard }
  }
  return heard ? { kind: 'send', text: heard } : { kind: 'empty' }
}

/** The draft after an edit-release: what was heard goes after anything already typed. */
export function draftWithHeard(draft: string, heard: string): string {
  if (!heard) {
    return draft
  }
  return draft.trim() ? `${draft.replace(/\s+$/u, '')} ${heard}` : heard
}
