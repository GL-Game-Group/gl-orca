/**
 * GL Work voice, loaded on first use. The vendor clients, the player and the company sign-in need
 * native modules (audio, crypto, keychain); Orca's components that offer voice import only this, so
 * they — and their tests — load none of that until a member actually speaks or listens.
 */
import type { CloudAsrOptions, CloudAsrSession } from './cloud-asr'
import type { CompanyVoiceVendor } from './company-voice'
import type { SpeechVoice } from './glwork-speech'

/** The one dynamic import: the native-module half of GL Work voice. */
function runtime(): Promise<typeof import('./glwork-voice-runtime')> {
  return import('./glwork-voice-runtime')
}

export type LoadedVoiceVendors =
  | { state: 'signed-out' }
  | { state: 'ready'; vendors: CompanyVoiceVendor[] }

export async function loadVoiceVendors(fresh = false): Promise<LoadedVoiceVendors> {
  const { loadCompanySession, fetchCompanyVoiceVendors } = await runtime()
  const session = await loadCompanySession()
  if (!session) {
    return { state: 'signed-out' }
  }
  return { state: 'ready', vendors: await fetchCompanyVoiceVendors(session, fresh) }
}

/** Starts recognition with the chosen vendor and mode (实时 or 识别): its token, then its client. */
export async function startCloudAsr(
  vendorId: string,
  kind: 'realtime' | 'file',
  handlers: Pick<CloudAsrOptions, 'onText' | 'onError'>
): Promise<CloudAsrSession> {
  const {
    loadCompanySession,
    companyVoiceToken,
    fetchCompanyVoiceVendors,
    startQwenAsr,
    startVolcAsr,
    startQwenFileAsr,
    startVolcFileAsr
  } = await runtime()
  const session = await loadCompanySession()
  if (!session) {
    throw new Error('请先在 GL Work 里登录公司账号，才能用千问或火山识别。')
  }
  const vendor = (await fetchCompanyVoiceVendors(session)).find((entry) => entry.id === vendorId)
  const model = kind === 'file' ? vendor?.asrFile?.model : vendor?.asr?.model
  if (!vendor || !model) {
    throw new Error('管理员没有为你开放这个语音识别，请在「语音设置」换一个。')
  }
  const token = await companyVoiceToken(session, vendorId)
  const options = { token: token.token, model, ...handlers }
  if (kind === 'file') {
    return vendor.protocol === 'dashscope' ? startQwenFileAsr(options) : startVolcFileAsr(options)
  }
  return vendor.protocol === 'dashscope' ? startQwenAsr(options) : startVolcAsr(options)
}

export async function speakGlWorkReply(markdown: string): Promise<void> {
  const speech = await runtime()
  await speech.speakGlWorkReply(markdown)
}

export async function speakWith(choice: SpeechVoice, markdown: string): Promise<void> {
  const speech = await runtime()
  await speech.speakWith(choice, markdown)
}

export async function previewVoice(sampleUrl: string): Promise<void> {
  const speech = await runtime()
  await speech.previewVoice(sampleUrl)
}
