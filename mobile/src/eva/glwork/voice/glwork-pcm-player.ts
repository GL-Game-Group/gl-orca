import {
  getMicrophonePermissionsAsync,
  initialize,
  playPCMData,
  stopPlayback
} from '@orca/expo-two-way-audio'
import { SPEECH_STREAM_RATE } from './glwork-speech-stream'

const BYTES_PER_SECOND = SPEECH_STREAM_RATE * 2
/** Slack after the last scheduled sample before a reading counts as finished. */
const TAIL_MS = 250

/**
 * Streaming read-aloud through Orca's two-way audio engine — the one dictation uses, so a reading
 * and the next hold-to-talk share one audio session instead of fighting over it. The engine holds
 * the microphone, so it is used only once the member has allowed it (they have, if they dictate);
 * otherwise the caller plays the reading whole.
 */
export async function pcmStreamPlayable(): Promise<boolean> {
  try {
    return (await getMicrophonePermissionsAsync()).granted && (await initialize())
  } catch {
    return false
  }
}

export type PcmStreamPlayback = {
  push: (pcm: Uint8Array) => void
  /** Resolves once everything pushed has played out (or the reading was superseded). */
  drained: (isCurrent: () => boolean) => Promise<void>
}

/**
 * The engine's player keeps reporting "playing" after its buffers run out, so the end is worked out
 * from the audio itself: each chunk moves the expected end by its own length.
 */
export function startPcmStreamPlayback(): PcmStreamPlayback {
  let endsAt = 0
  let carry: Uint8Array | null = null
  return {
    push(pcm) {
      let bytes = pcm
      if (carry) {
        bytes = new Uint8Array(carry.length + pcm.length)
        bytes.set(carry)
        bytes.set(pcm, carry.length)
        carry = null
      }
      // Whole 16-bit samples only; an odd byte waits for the next chunk.
      if (bytes.length % 2 === 1) {
        carry = bytes.slice(-1)
        bytes = bytes.subarray(0, -1)
      }
      if (bytes.length === 0) {
        return
      }
      const now = Date.now()
      endsAt = Math.max(endsAt, now) + (bytes.length / BYTES_PER_SECOND) * 1000
      playPCMData(bytes)
    },
    async drained(isCurrent) {
      while (isCurrent() && Date.now() < endsAt + TAIL_MS) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }
}

/** Cuts a streamed reading off (a stop, or a later reading). */
export function stopPcmStream(): void {
  try {
    stopPlayback()
  } catch {
    // No engine: nothing is playing.
  }
}
