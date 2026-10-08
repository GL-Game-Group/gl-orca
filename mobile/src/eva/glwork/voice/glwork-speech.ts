import { isRecording, tearDown } from '@orca/expo-two-way-audio'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { File, Paths } from 'expo-file-system'
import * as ExpoCrypto from 'expo-crypto'
import { loadCompanySession } from '../company-session'
import { base64ToBytes } from './cloud-asr'
import {
  companyVoiceToken,
  fetchCompanyVoiceVendors,
  type CompanyVoiceVendor
} from './company-voice'
import { effectiveSpeechChoice, speechChoiceProblem } from './glwork-speech-choice'
import { speechPieces, speechText } from './glwork-speech-text'
import { loadGlWorkVoicePrefs } from './glwork-voice-prefs'
import { registerGlWorkSpeechStopper, setGlWorkSpeaking } from './glwork-speech-state'

const QWEN_TTS =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const VOLC_TTS = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const REQUEST_TIMEOUT_MS = 30_000
/** A piece that has not started playing by then is reported, not left as "正在朗读" forever. */
const LOAD_TIMEOUT_MS = 20_000

let player: AudioPlayer | null = null
/** Bumped by every speak and stop: a reading started earlier stops at its next piece. */
let generation = 0
registerGlWorkSpeechStopper(() => {
  generation += 1
  player?.pause()
})

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
async function qwenAudio(
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
async function volcAudio(
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

/** Plays one source to its end, or until a later speak or stop; fails if it never starts. */
function play(source: string, mine: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mine !== generation) {
      resolve()
      return
    }
    player ??= createAudioPlayer(null)
    const current = player
    let started = false
    const finish = (error?: Error): void => {
      clearTimeout(timer)
      subscription.remove()
      if (error) {
        current.pause()
        reject(error)
      } else {
        resolve()
      }
    }
    const timer = setTimeout(() => {
      if (!started && mine === generation) {
        finish(new Error('音频没有开始播放，请检查网络后再试。'))
      }
    }, LOAD_TIMEOUT_MS)
    const subscription = current.addListener('playbackStatusUpdate', (status) => {
      started ||= status.isLoaded && (status.playing || status.currentTime > 0)
      if (status.didJustFinish || mine !== generation) {
        finish()
      }
    })
    current.replace({ uri: source })
    current.play()
  })
}

/**
 * Playback, not recording, so it uses the speaker and ignores the silent switch. Orca's two-way audio
 * engine sets the session up once, when it is created, and reuses itself on every later dictation;
 * left running under playback it hears nothing again. An idle engine is torn down first, so the
 * switch succeeds and the next dictation builds a fresh engine and session. A busy one refuses the
 * switch ('!pri', OSStatus 561017449); its play-and-record session plays through the speaker too.
 */
async function speakerAudioMode(): Promise<void> {
  try {
    if (!isRecording()) {
      tearDown()
    }
  } catch {
    // No engine yet.
  }
  try {
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })
  } catch {
    // Keep the session dictation holds; see above.
  }
}

export type SpeechVoice = { vendor: CompanyVoiceVendor; voice: string; rate: number }

/** Reads text aloud with the given vendor and voice, piece by piece; resolves when done or stopped. */
export async function speakWith(choice: SpeechVoice, markdown: string): Promise<void> {
  const text = speechText(markdown)
  const model = choice.vendor.tts?.model
  if (!text || !model) {
    return
  }
  const mine = ++generation
  setGlWorkSpeaking(true)
  try {
    const session = await loadCompanySession()
    if (!session) {
      throw new Error('请先在 GL Work 里登录公司账号，才能用语音播报。')
    }
    await speakerAudioMode()
    for (const piece of speechPieces(text)) {
      if (mine !== generation) {
        return
      }
      const token = await companyVoiceToken(session, choice.vendor.id)
      const source =
        choice.vendor.protocol === 'dashscope'
          ? await qwenAudio(token.token, model, choice.voice, piece)
          : await volcAudio(token.token, model, choice.voice, piece, choice.rate)
      await play(source, mine)
    }
  } finally {
    if (mine === generation) {
      setGlWorkSpeaking(false)
    }
  }
}

/** Reads a reply with the voice from Settings → Voice (or the first one open to the member). */
export async function speakGlWorkReply(markdown: string): Promise<void> {
  const prefs = await loadGlWorkVoicePrefs()
  const session = await loadCompanySession()
  if (!session) {
    throw new Error('请先在 GL Work 里登录公司账号，才能用语音播报。')
  }
  const vendors = await fetchCompanyVoiceVendors(session)
  const choice = effectiveSpeechChoice(prefs, vendors)
  const problem = speechChoiceProblem(choice, vendors)
  if (problem || !choice.vendor || !choice.voice) {
    throw new Error(problem ?? '没有可用的音色。')
  }
  await speakWith({ vendor: choice.vendor, voice: choice.voice.id, rate: prefs.tts.rate }, markdown)
}

/** Plays a vendor's own recording of a voice (Settings → Voice previews). */
export async function previewVoice(sampleUrl: string): Promise<void> {
  const mine = ++generation
  setGlWorkSpeaking(true)
  try {
    await speakerAudioMode()
    await play(sampleUrl.replace(/^http:\/\//u, 'https://'), mine)
  } finally {
    if (mine === generation) {
      setGlWorkSpeaking(false)
    }
  }
}
