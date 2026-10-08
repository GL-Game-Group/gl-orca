import type { CompanyVoiceOption, CompanyVoiceVendor } from './company-voice'

/** Read-aloud: streamed as it is synthesized (实时), or synthesized whole (语音). */
export type SpeechKind = 'stream' | 'file'

export type SpeechOption = {
  vendor: CompanyVoiceVendor
  kind: SpeechKind
  model: string
  voices: CompanyVoiceOption[]
  /** As the phone lists it: 千问实时, 千问语音, 火山实时, 火山语音. */
  label: string
}

export type RecognitionOption = {
  vendor: CompanyVoiceVendor
  kind: 'realtime' | 'file'
  model: string
  /** 千问实时, 千问识别, 火山实时, 火山识别. */
  label: string
  /** Recognition of a finished recording is listed but not wired yet. */
  available: boolean
}

/** "千问语音" → "千问": the vendor's name without the word every option adds. */
export function vendorShortName(name: string): string {
  return name.replace(/语音$/u, '') || name
}

/** Each vendor's read-aloud choices that are switched on, 实时 first. */
export function speechOptions(vendors: readonly CompanyVoiceVendor[]): SpeechOption[] {
  return vendors.flatMap((vendor) => {
    const name = vendorShortName(vendor.name)
    const options: SpeechOption[] = []
    if (vendor.ttsStream) {
      options.push({ vendor, kind: 'stream', ...vendor.ttsStream, label: `${name}实时` })
    }
    if (vendor.tts) {
      options.push({ vendor, kind: 'file', ...vendor.tts, label: `${name}语音` })
    }
    return options
  })
}

/** Each vendor's recognition choices that are switched on, 实时 first. */
export function recognitionOptions(vendors: readonly CompanyVoiceVendor[]): RecognitionOption[] {
  return vendors.flatMap((vendor) => {
    const name = vendorShortName(vendor.name)
    const options: RecognitionOption[] = []
    if (vendor.asr) {
      options.push({
        vendor,
        kind: 'realtime',
        model: vendor.asr.model,
        label: `${name}实时`,
        available: true
      })
    }
    if (vendor.asrFile) {
      options.push({
        vendor,
        kind: 'file',
        model: vendor.asrFile.model,
        label: `${name}识别`,
        available: false
      })
    }
    return options
  })
}
