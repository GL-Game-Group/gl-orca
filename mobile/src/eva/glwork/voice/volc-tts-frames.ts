/**
 * Volcengine's bidirectional TTS frames (openspeech v3 /api/v3/tts/bidirection): a 4-byte header with
 * the "has event" flag, the event number, the session id for session events, then the payload. No
 * native imports, so the framing is tested on its own (and mirrored in scripts/voice-test).
 */
import { utf8Decode, utf8Encode } from './cloud-asr'

export const VOLC_TTS_EVENT = {
  StartConnection: 1,
  FinishConnection: 2,
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  StartSession: 100,
  FinishSession: 102,
  SessionStarted: 150,
  SessionFinished: 152,
  SessionFailed: 153,
  TaskRequest: 200,
  TTSResponse: 352
} as const

const FULL_SERVER_RESPONSE = 0b1001
const AUDIO_ONLY_RESPONSE = 0b1011
const SERVER_ERROR = 0b1111
const HAS_EVENT = 0b0100

function uint32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

/** A client event: full client request, JSON, with the session id when the event has one. */
export function volcTtsEvent(
  event: number,
  sessionId: string | null,
  payload: unknown
): Uint8Array {
  const id = sessionId === null ? null : utf8Encode(sessionId)
  const body = utf8Encode(JSON.stringify(payload))
  const parts = [
    Uint8Array.of(0x11, 0x14, 0x10, 0x00),
    uint32(event),
    ...(id ? [uint32(id.length), id] : []),
    uint32(body.length),
    body
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export type VolcTtsServerMessage =
  | { kind: 'audio'; pcm: Uint8Array }
  | { kind: 'event'; event: number; payload: string }
  | { kind: 'error'; code: number; message: string }
  | { kind: 'other' }

export function readVolcTtsMessage(data: ArrayBuffer): VolcTtsServerMessage {
  const bytes = new Uint8Array(data)
  if (bytes.length < 8) {
    return { kind: 'other' }
  }
  const view = new DataView(data)
  const type = bytes[1] >> 4
  const flags = bytes[1] & 0x0f
  let offset = (bytes[0] & 0x0f) * 4
  if (type === SERVER_ERROR) {
    const code = view.getUint32(offset)
    const size = view.getUint32(offset + 4)
    return {
      kind: 'error',
      code,
      message: utf8Decode(bytes.subarray(offset + 8, offset + 8 + size))
    }
  }
  if ((type !== FULL_SERVER_RESPONSE && type !== AUDIO_ONLY_RESPONSE) || !(flags & HAS_EVENT)) {
    return { kind: 'other' }
  }
  const event = view.getInt32(offset)
  offset += 4
  // Connection events carry the connection id, session events the session id.
  if (event >= VOLC_TTS_EVENT.ConnectionStarted) {
    offset += 4 + view.getUint32(offset)
  }
  const size = view.getUint32(offset)
  const payload = bytes.subarray(offset + 4, offset + 4 + size)
  if (type === AUDIO_ONLY_RESPONSE && event === VOLC_TTS_EVENT.TTSResponse) {
    return { kind: 'audio', pcm: payload }
  }
  return { kind: 'event', event, payload: utf8Decode(payload) }
}
