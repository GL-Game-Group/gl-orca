import { bytesToBase64, type CloudAsrOptions, type CloudAsrSession } from './cloud-asr'
import { pcmWavBytes } from './glwork-pcm-wav'

/** A recording longer than this is refused before upload (both vendors take a few minutes at most). */
export const FILE_ASR_MAX_SECONDS = 170
const BYTES_PER_SECOND = 16_000 * 2
export const FILE_ASR_TIMEOUT_MS = 30_000

/**
 * Recognition of the finished recording (识别): the microphone's PCM is kept until the hold ends,
 * then sent once as a WAV (base64) and the whole text comes back. No words while speaking.
 */
export function startFileAsr(
  options: CloudAsrOptions,
  recognize: (wavBase64: string, signal: AbortSignal) => Promise<string>
): CloudAsrSession {
  const parts: Uint8Array[] = []
  let size = 0
  const controller = new AbortController()
  return {
    feed(pcm) {
      parts.push(pcm.slice())
      size += pcm.length
    },
    async finish() {
      if (size === 0) {
        return ''
      }
      if (size / BYTES_PER_SECOND > FILE_ASR_MAX_SECONDS) {
        throw new Error(`一次说得太长了（超过 ${FILE_ASR_MAX_SECONDS} 秒），请分几次说。`)
      }
      const timer = setTimeout(() => controller.abort(), FILE_ASR_TIMEOUT_MS)
      try {
        const text = (await recognize(bytesToBase64(pcmWavBytes(parts)), controller.signal)).trim()
        options.onText(text)
        return text
      } finally {
        clearTimeout(timer)
      }
    },
    cancel() {
      controller.abort()
      parts.length = 0
      size = 0
    }
  }
}
