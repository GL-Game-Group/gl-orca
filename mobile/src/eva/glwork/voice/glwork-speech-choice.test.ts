import { describe, expect, it } from 'vitest'
import type { CompanyVoiceVendor } from './company-voice'
import { effectiveSpeechChoice, speechChoiceProblem } from './glwork-speech-choice'
import type { GlWorkVoicePrefs } from './glwork-voice-prefs'

const voice = (id: string) => ({ id, name: id, description: null, gender: null, sampleUrl: null })
const vendor = (
  id: string,
  voices: string[] | null,
  streamVoices: string[] | null = null
): CompanyVoiceVendor => ({
  id,
  name: `${id}语音`,
  protocol: 'dashscope',
  asr: { model: 'asr' },
  asrFile: null,
  ttsStream: streamVoices ? { model: 'tts-rt', voices: streamVoices.map(voice) } : null,
  tts: voices ? { model: 'tts', voices: voices.map(voice) } : null
})
const prefs = (tts: Partial<GlWorkVoicePrefs['tts']> = {}): GlWorkVoicePrefs => ({
  asrVendor: null,
  inputMode: 'keyboard',
  tts: { autoRead: true, vendor: null, kind: null, voice: null, rate: 0, ...tts }
})

describe('read-aloud choice', () => {
  it('falls back to the first option (实时 first) and its first voice', () => {
    const vendors = [vendor('asr-only', null), vendor('qwen', ['Ethan'], ['Cherry'])]
    const choice = effectiveSpeechChoice(prefs(), vendors)
    expect([choice.option?.label, choice.voice?.id]).toEqual(['qwen实时', 'Cherry'])
    expect(speechChoiceProblem(choice, vendors)).toBeNull()
  })

  it('keeps the member’s picks while they are still offered', () => {
    const vendors = [vendor('qwen', ['Cherry']), vendor('volc', ['a', 'b'], ['c'])]
    const choice = effectiveSpeechChoice(
      prefs({ vendor: 'volc', kind: 'file', voice: 'b' }),
      vendors
    )
    expect([choice.option?.label, choice.voice?.id]).toEqual(['volc语音', 'b'])
  })

  it('says why there is nothing to read with', () => {
    const empty = [vendor('qwen', [])]
    expect(speechChoiceProblem(effectiveSpeechChoice(prefs(), empty), empty)).toContain('音色库')
    const asrOnly = [vendor('qwen', null)]
    expect(speechChoiceProblem(effectiveSpeechChoice(prefs(), asrOnly), asrOnly)).toContain(
      '只开放了语音识别'
    )
  })
})
