import { describe, expect, it } from 'vitest'
import type { CompanyVoiceVendor } from './company-voice'
import { effectiveSpeechChoice, speechChoiceProblem } from './glwork-speech-choice'
import type { GlWorkVoicePrefs } from './glwork-voice-prefs'

const voice = (id: string) => ({ id, name: id, description: null, gender: null, sampleUrl: null })
const vendor = (id: string, voices: string[] | null): CompanyVoiceVendor => ({
  id,
  name: id,
  protocol: 'dashscope',
  asr: { model: 'asr' },
  tts: voices ? { model: 'tts', voices: voices.map(voice) } : null
})
const prefs = (tts: Partial<GlWorkVoicePrefs['tts']> = {}): GlWorkVoicePrefs => ({
  asrVendor: null,
  tts: { autoRead: true, vendor: null, voice: null, rate: 0, ...tts }
})

describe('read-aloud choice', () => {
  it('falls back to the first vendor with read-aloud and its first voice', () => {
    const vendors = [vendor('asr-only', null), vendor('qwen', ['Cherry', 'Ethan'])]
    const choice = effectiveSpeechChoice(prefs(), vendors)
    expect([choice.vendor?.id, choice.voice?.id]).toEqual(['qwen', 'Cherry'])
    expect(speechChoiceProblem(choice, vendors)).toBeNull()
  })

  it('keeps the member’s picks while they are still offered', () => {
    const vendors = [vendor('qwen', ['Cherry']), vendor('volc', ['a', 'b'])]
    const choice = effectiveSpeechChoice(prefs({ vendor: 'volc', voice: 'b' }), vendors)
    expect([choice.vendor?.id, choice.voice?.id]).toEqual(['volc', 'b'])
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
