import type { CompanyVoiceOption, CompanyVoiceVendor } from './company-voice'
import type { GlWorkVoicePrefs } from './glwork-voice-prefs'

export type GlWorkSpeechChoice = {
  vendor: CompanyVoiceVendor | null
  voice: CompanyVoiceOption | null
}

/**
 * The vendor and voice read-aloud uses: the member's picks while they are still open to them, else
 * the first vendor with read-aloud and its first voice — so turning on 自动朗读 works without
 * visiting the lists first. Settings shows the same choice it will read with.
 */
export function effectiveSpeechChoice(
  prefs: GlWorkVoicePrefs,
  vendors: readonly CompanyVoiceVendor[]
): GlWorkSpeechChoice {
  const tts = vendors.filter((vendor) => vendor.tts)
  const vendor = tts.find((entry) => entry.id === prefs.tts.vendor) ?? tts[0] ?? null
  const voices = vendor?.tts?.voices ?? []
  const voice = voices.find((entry) => entry.id === prefs.tts.voice) ?? voices[0] ?? null
  return { vendor, voice }
}

/** Why there is nothing to read with, for the member; null when there is a voice. */
export function speechChoiceProblem(
  choice: GlWorkSpeechChoice,
  vendors: readonly CompanyVoiceVendor[]
): string | null {
  if (!choice.vendor) {
    return vendors.length === 0
      ? '管理员还没有为你开放语音服务。'
      : '管理员没有为你开放语音播报，只开放了语音识别。'
  }
  if (!choice.voice) {
    return `${choice.vendor.name} 还没有可用的音色：请管理员在后台「AI 管理 → 语音」把音色加入音色库。`
  }
  return null
}
