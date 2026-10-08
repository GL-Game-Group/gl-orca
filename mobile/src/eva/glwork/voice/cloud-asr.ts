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

/** Why a vendor refused the WebSocket handshake, from the status React Native reports. */
export function describeAsrHandshakeFailure(
  vendor: string,
  model: string,
  detail: string,
  what: '识别' | '合成' = '识别'
): string {
  const status = /\b([45]\d\d)\b/.exec(detail)?.[1]
  switch (status) {
    case '401':
      return `${vendor}拒绝了语音 Key（401）：Key 无效、过期或已删除，请管理员在后台检查${vendor}的语音 Key。`
    case '403':
      return `${vendor}的语音 Key 没有开通${what}资源 ${model}（403）：请管理员在${vendor}控制台为这个 Key 开通它，或在后台「AI 管理 → 语音」换一个${what}模型。`
    case '429':
      return `${vendor}的语音${what}额度或并发用完了（429），请稍后再试或联系管理员。`
    case undefined:
      return `连不上${vendor}的语音${what}${detail ? `（${detail}）` : ''}，请检查网络。`
    default:
      return `${vendor}的语音${what}拒绝了连接（${status}）${detail ? `：${detail}` : ''}`
  }
}

/** Resolves once the WebSocket is open, or rejects with why the vendor would not take it. */
export function whenOpen(
  socket: WebSocket,
  vendor: string,
  model: string,
  what: '识别' | '合成' = '识别'
): Promise<void> {
  return new Promise((resolve, reject) => {
    let detail = ''
    socket.onopen = () => resolve()
    socket.onerror = (event) => {
      // Why: React Native puts the handshake's failure (e.g. "bad response code 403") on the event.
      const message = 'message' in event ? event.message : undefined
      detail = typeof message === 'string' ? message : ''
      reject(new Error(describeAsrHandshakeFailure(vendor, model, detail, what)))
    }
    socket.onclose = (event) =>
      reject(
        new Error(
          describeAsrHandshakeFailure(
            vendor,
            model,
            `${event.code} ${event.reason || detail}`.trim(),
            what
          )
        )
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
