import type { CompanyVoiceOption, CompanyVoiceVendor } from './company-voice'
import { speechOptions, type SpeechOption } from './glwork-voice-options'
import type { GlWorkVoicePrefs } from './glwork-voice-prefs'

export type GlWorkSpeechChoice = {
  option: SpeechOption | null
  voice: CompanyVoiceOption | null
}

/**
 * The read-aloud option and voice used: the member's picks while still offered, else the first
 * option (实时 before 语音) and its first voice — so 自动朗读 works without visiting the lists first.
 * Settings shows the same choice it will read with.
 */
export function effectiveSpeechChoice(
  prefs: GlWorkVoicePrefs,
  vendors: readonly CompanyVoiceVendor[]
): GlWorkSpeechChoice {
  const options = speechOptions(vendors)
  const option =
    options.find(
      (entry) => entry.vendor.id === prefs.tts.vendor && entry.kind === prefs.tts.kind
    ) ??
    options.find((entry) => entry.vendor.id === prefs.tts.vendor) ??
    options[0] ??
    null
  const voices = option?.voices ?? []
  const voice = voices.find((entry) => entry.id === prefs.tts.voice) ?? voices[0] ?? null
  return { option, voice }
}

/** Why there is nothing to read with, for the member; null when there is a voice. */
export function speechChoiceProblem(
  choice: GlWorkSpeechChoice,
  vendors: readonly CompanyVoiceVendor[]
): string | null {
  if (!choice.option) {
    return vendors.length === 0
      ? '管理员还没有为你开放语音服务。'
      : '管理员没有为你开放语音播报，只开放了语音识别。'
  }
  if (!choice.voice) {
    return `${choice.option.label}还没有可用的音色：请管理员在后台「AI 管理 → 语音」把音色加入音色库。`
  }
  return null
}
