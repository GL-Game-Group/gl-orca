import { isRecording, tearDown } from '@orca/expo-two-way-audio'
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { loadCompanySession } from '../company-session'
import { companyVoiceToken, fetchCompanyVoiceVendors } from './company-voice'
import { pcmStreamPlayable, startPcmStreamPlayback, stopPcmStream } from './glwork-pcm-player'
import { effectiveSpeechChoice, speechChoiceProblem } from './glwork-speech-choice'
import { qwenAudio, volcAudio, writePcmWav } from './glwork-speech-file'
import {
  registerGlWorkSpeechStopper,
  setGlWorkLastSpoken,
  setGlWorkSpeaking
} from './glwork-speech-state'
import type { SpeechStreamRequest } from './glwork-speech-stream'
import { speechPieces, speechText } from './glwork-speech-text'
import type { SpeechOption } from './glwork-voice-options'
import { loadGlWorkVoicePrefs } from './glwork-voice-prefs'
import { streamQwenSpeech } from './qwen-tts-stream'
import { streamVolcSpeech } from './volc-tts-stream'

/** A piece that has not started playing by then is reported, not left as "正在朗读" forever. */
const LOAD_TIMEOUT_MS = 20_000

let player: AudioPlayer | null = null
/** Bumped by every speak and stop: a reading started earlier stops at its next piece. */
let generation = 0
registerGlWorkSpeechStopper(() => {
  generation += 1
  player?.pause()
  stopPcmStream()
})

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

export type SpeechVoice = { option: SpeechOption; voice: string; rate: number }

/**
 * A streamed reading: each piece synthesized over the vendor's WebSocket and played as it arrives,
 * through the engine dictation uses. Without the microphone allowed, gathered whole and played as a
 * file instead.
 */
async function speakStreamed(
  choice: SpeechVoice,
  token: () => Promise<string>,
  pieces: readonly string[],
  mine: number
): Promise<void> {
  const synthesize = (request: SpeechStreamRequest): Promise<void> =>
    choice.option.vendor.protocol === 'dashscope'
      ? streamQwenSpeech(request)
      : streamVolcSpeech(request)
  const isCurrent = (): boolean => mine === generation
  const streamed = await pcmStreamPlayable()
  const playback = streamed ? startPcmStreamPlayback() : null
  const gathered: Uint8Array[] = []
  for (const piece of pieces) {
    if (!isCurrent()) {
      return
    }
    await synthesize({
      token: await token(),
      model: choice.option.model,
      voice: choice.voice,
      rate: choice.rate,
      text: piece,
      isCurrent,
      onAudio: (pcm) => (playback ? playback.push(pcm) : gathered.push(pcm))
    })
  }
  if (playback) {
    await playback.drained(isCurrent)
  } else if (gathered.length > 0) {
    await speakerAudioMode()
    await play(writePcmWav(gathered), mine)
  }
}

/** Reads text aloud with the given option and voice; resolves when done or stopped. */
export async function speakWith(choice: SpeechVoice, markdown: string): Promise<void> {
  const text = speechText(markdown)
  if (!text) {
    return
  }
  const mine = ++generation
  setGlWorkSpeaking(true)
  try {
    const session = await loadCompanySession()
    if (!session) {
      throw new Error('请先在 GL Work 里登录公司账号，才能用语音播报。')
    }
    const { vendor, model } = choice.option
    const token = async (): Promise<string> => (await companyVoiceToken(session, vendor.id)).token
    if (choice.option.kind === 'stream') {
      await speakStreamed(choice, token, speechPieces(text), mine)
      return
    }
    await speakerAudioMode()
    for (const piece of speechPieces(text)) {
      if (mine !== generation) {
        return
      }
      const source =
        vendor.protocol === 'dashscope'
          ? await qwenAudio(await token(), model, choice.voice, piece)
          : await volcAudio(await token(), model, choice.voice, piece, choice.rate)
      await play(source, mine)
    }
  } finally {
    if (mine === generation) {
      setGlWorkSpeaking(false)
    }
  }
}

/** Reads a reply with the choice from Settings → Voice (or the first one open to the member). */
export async function speakGlWorkReply(markdown: string): Promise<void> {
  const prefs = await loadGlWorkVoicePrefs()
  const session = await loadCompanySession()
  if (!session) {
    throw new Error('请先在 GL Work 里登录公司账号，才能用语音播报。')
  }
  const vendors = await fetchCompanyVoiceVendors(session)
  const choice = effectiveSpeechChoice(prefs, vendors)
  const problem = speechChoiceProblem(choice, vendors)
  if (problem || !choice.option || !choice.voice) {
    throw new Error(problem ?? '没有可用的音色。')
  }
  setGlWorkLastSpoken(markdown)
  await speakWith({ option: choice.option, voice: choice.voice.id, rate: prefs.tts.rate }, markdown)
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
