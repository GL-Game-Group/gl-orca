import { File, Paths } from 'expo-file-system'
import * as ExpoCrypto from 'expo-crypto'
import { base64ToBytes } from './cloud-asr'
import { SPEECH_STREAM_RATE } from './glwork-speech-stream'

const QWEN_TTS =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const VOLC_TTS = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const REQUEST_TIMEOUT_MS = 30_000

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Qwen-TTS over HTTP: the reply names a WAV file on OSS. Its URL is http://, which iOS blocks (the
 * app allows only local http), so it is fetched over https into the cache and played from there.
 */
export async function qwenAudio(
  token: string,
  model: string,
  voice: string,
  text: string
): Promise<string> {
  const response = await post(
    QWEN_TTS,
    { authorization: `Bearer ${token}` },
    {
      model,
      input: { text, voice, language_type: 'Chinese' }
    }
  )
  const body: unknown = await response.json().catch(() => null)
  const output = typeof body === 'object' && body !== null && 'output' in body ? body.output : null
  const audio =
    typeof output === 'object' && output !== null && 'audio' in output ? output.audio : null
  const url = typeof audio === 'object' && audio !== null && 'url' in audio ? audio.url : null
  if (!response.ok || typeof url !== 'string') {
    const message =
      typeof body === 'object' && body !== null && 'message' in body ? String(body.message) : ''
    throw new Error(`千问语音合成失败（${response.status} ${message}）`.trim())
  }
  const file = new File(Paths.cache, `glwork-speech-${ExpoCrypto.randomUUID()}.wav`)
  try {
    await File.downloadFileAsync(url.replace(/^http:\/\//u, 'https://'), file)
  } catch (error) {
    throw new Error(`千问语音下载失败（${error instanceof Error ? error.message : String(error)}）`)
  }
  return file.uri
}

/** Volcengine's V3 HTTP synthesis: JSON objects carrying base64 MP3, written to a cache file. */
export async function volcAudio(
  token: string,
  model: string,
  voice: string,
  text: string,
  rate: number
): Promise<string> {
  const response = await post(
    VOLC_TTS,
    { 'x-api-key': token, 'x-api-resource-id': model, 'x-api-request-id': ExpoCrypto.randomUUID() },
    {
      user: { uid: 'glwork-phone' },
      req_params: {
        text,
        speaker: voice,
        audio_params: { format: 'mp3', sample_rate: 24000, speech_rate: rate }
      }
    }
  )
  const raw = await response.text()
  const parts: Uint8Array[] = []
  let failure = ''
  for (const piece of raw.split(/\r?\n|(?<=\})(?=\{)/u)) {
    let item: Record<string, unknown>
    try {
      item = JSON.parse(piece.trim())
    } catch {
      continue
    }
    if (typeof item.data === 'string' && item.data !== '') {
      parts.push(base64ToBytes(item.data))
    }
    if (item.code !== undefined && item.code !== 0 && item.code !== 20000000) {
      failure = `${String(item.code)} ${String(item.message ?? '')}`.trim()
    }
  }
  if (!response.ok || failure || parts.length === 0) {
    throw new Error(`火山语音合成失败（${failure || response.status}）`)
  }
  const file = new File(Paths.cache, `glwork-speech-${ExpoCrypto.randomUUID()}.mp3`)
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  file.write(bytes)
  return file.uri
}

/** A streamed reading gathered whole, as a WAV file in the cache (when it cannot be streamed). */
export function writePcmWav(parts: readonly Uint8Array[]): string {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(44 + size)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i += 1) {
      bytes[offset + i] = value.charCodeAt(i)
    }
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + size, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SPEECH_STREAM_RATE, true)
  view.setUint32(28, SPEECH_STREAM_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, size, true)
  let offset = 44
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  const file = new File(Paths.cache, `glwork-speech-${ExpoCrypto.randomUUID()}.wav`)
  file.write(bytes)
  return file.uri
}
