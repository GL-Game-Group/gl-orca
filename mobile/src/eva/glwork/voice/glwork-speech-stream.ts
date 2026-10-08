/** Streaming read-aloud: 16 kHz 16-bit mono PCM, what Orca's two-way audio engine plays. */
export const SPEECH_STREAM_RATE = 16_000
/** One reading may take this long to synthesize before it is given up. */
export const SPEECH_STREAM_TIMEOUT_MS = 60_000

export type SpeechStreamRequest = {
  token: string
  model: string
  voice: string
  /** Volcengine's speech_rate (-50 … 100); Qwen reads at its own pace. */
  rate: number
  text: string
  onAudio: (pcm: Uint8Array) => void
  /** False once a later speak or a stop superseded this reading: the stream is dropped. */
  isCurrent: () => boolean
}
