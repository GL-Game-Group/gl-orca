/** A speech recognition session at a vendor, fed the phone microphone's 16 kHz mono 16-bit PCM. */
export type CloudAsrSession = {
  feed: (pcm: Uint8Array) => void
  /** Ends the audio and resolves with the whole transcript. */
  finish: () => Promise<string>
  cancel: () => void
}

export type CloudAsrOptions = {
  token: string
  model: string
  /** The transcript so far, confirmed text and the part still being recognized, as it grows. */
  onText: (text: string) => void
  /** The vendor or the connection failed after the session started. */
  onError: (error: Error) => void
}

/** How long a finish waits for the vendor's last result before giving what it has. */
export const CLOUD_ASR_FINISH_TIMEOUT_MS = 8_000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** Collects microphone chunks into packets of about `bytes` (100 ms is 3,200 bytes). */
export class PcmPacker {
  private parts: Uint8Array[] = []
  private size = 0
  private readonly bytes: number

  constructor(bytes: number) {
    this.bytes = bytes
  }

  push(chunk: Uint8Array): Uint8Array | null {
    this.parts.push(chunk)
    this.size += chunk.length
    return this.size >= this.bytes ? this.drain() : null
  }

  drain(): Uint8Array | null {
    if (this.size === 0) {
      return null
    }
    const packet = new Uint8Array(this.size)
    let offset = 0
    for (const part of this.parts) {
      packet.set(part, offset)
      offset += part.length
    }
    this.parts = []
    this.size = 0
    return packet
  }
}

/** Opens a WebSocket and resolves once it is open; `open` is what both vendors wait for before talking. */
export function whenOpen(socket: WebSocket, vendor: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`连不上${vendor}的语音识别，请检查网络。`))
    socket.onclose = (event) =>
      reject(
        new Error(`${vendor}的语音识别拒绝了连接（${event.code} ${event.reason || ''}）。`.trim())
      )
  })
}

/** UTF-8 by hand: Hermes does not promise TextEncoder/TextDecoder. */
export function utf8Encode(value: string): Uint8Array {
  const out: number[] = []
  for (const char of value) {
    let code = char.codePointAt(0) ?? 0
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return Uint8Array.from(out)
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const byte = bytes[i] ?? 0
    let code: number
    let extra: number
    if (byte < 0x80) {
      code = byte
      extra = 0
    } else if (byte >= 0xf0) {
      code = byte & 0x07
      extra = 3
    } else if (byte >= 0xe0) {
      code = byte & 0x0f
      extra = 2
    } else {
      code = byte & 0x1f
      extra = 1
    }
    for (let k = 1; k <= extra; k += 1) {
      code = (code << 6) | ((bytes[i + k] ?? 0) & 0x3f)
    }
    out += String.fromCodePoint(code)
    i += extra + 1
  }
  return out
}
