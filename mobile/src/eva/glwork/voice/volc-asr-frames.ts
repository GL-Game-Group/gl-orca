/**
 * Volcengine's streaming ASR frames (openspeech v3 sauc): a 4-byte header, an optional signed sequence,
 * a payload size, the payload. No native imports, so the framing is tested on its own.
 *
 * Header: version 1 and header size 1 (4 bytes) → 0x11; message type << 4 | flags; serialization << 4
 * | compression; reserved.
 */
import { utf8Decode, utf8Encode } from './cloud-asr'

const FULL_CLIENT_REQUEST = 0b0001
const AUDIO_ONLY_REQUEST = 0b0010
const FULL_SERVER_RESPONSE = 0b1001
const SERVER_ERROR = 0b1111
/** Flags: a sequence follows the header; with the last-packet bit it is the final packet's (negative) number. */
const HAS_SEQUENCE = 0b0001
const LAST_PACKET = 0b0010
const HAS_EVENT = 0b0100
const JSON_SERIALIZATION = 0b0001
const NO_SERIALIZATION = 0b0000

function frame(
  type: number,
  flags: number,
  serialization: number,
  sequence: number,
  payload: Uint8Array
): Uint8Array {
  const out = new Uint8Array(12 + payload.length)
  const view = new DataView(out.buffer)
  out[0] = 0x11
  out[1] = (type << 4) | flags
  out[2] = serialization << 4
  out[3] = 0
  view.setInt32(4, sequence)
  view.setUint32(8, payload.length)
  out.set(payload, 12)
  return out
}

export function volcFullClientRequest(sequence: number, request: unknown): Uint8Array {
  const payload = utf8Encode(JSON.stringify(request))
  return frame(FULL_CLIENT_REQUEST, HAS_SEQUENCE, JSON_SERIALIZATION, sequence, payload)
}

export function volcAudioRequest(sequence: number, pcm: Uint8Array, last: boolean): Uint8Array {
  return last
    ? frame(AUDIO_ONLY_REQUEST, HAS_SEQUENCE | LAST_PACKET, NO_SERIALIZATION, -sequence, pcm)
    : frame(AUDIO_ONLY_REQUEST, HAS_SEQUENCE, NO_SERIALIZATION, sequence, pcm)
}

export type VolcServerMessage =
  | { kind: 'result'; text: string; last: boolean }
  | { kind: 'error'; code: number; message: string }
  | { kind: 'other' }

export function readVolcServerMessage(data: ArrayBuffer): VolcServerMessage {
  const bytes = new Uint8Array(data)
  if (bytes.length < 4) {
    return { kind: 'other' }
  }
  const view = new DataView(data)
  const headerSize = (bytes[0] & 0x0f) * 4
  const type = bytes[1] >> 4
  const flags = bytes[1] & 0x0f
  let offset = headerSize
  if (type === SERVER_ERROR) {
    const code = view.getUint32(offset)
    const size = view.getUint32(offset + 4)
    const message = utf8Decode(bytes.subarray(offset + 8, offset + 8 + size))
    return { kind: 'error', code, message }
  }
  if (type !== FULL_SERVER_RESPONSE) {
    return { kind: 'other' }
  }
  if (flags & HAS_SEQUENCE) {
    offset += 4
  }
  if (flags & HAS_EVENT) {
    offset += 4
  }
  const size = view.getUint32(offset)
  const raw = utf8Decode(bytes.subarray(offset + 4, offset + 4 + size))
  let text = ''
  try {
    const body: unknown = JSON.parse(raw)
    const result =
      typeof body === 'object' && body !== null && 'result' in body ? body.result : null
    if (typeof result === 'object' && result !== null && 'text' in result) {
      text = String(result.text ?? '')
    }
  } catch {
    // A payload that is not JSON carries no text.
  }
  return { kind: 'result', text, last: (flags & LAST_PACKET) !== 0 }
}
