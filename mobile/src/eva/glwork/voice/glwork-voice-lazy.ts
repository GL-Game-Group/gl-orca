/**
 * GL Work voice, loaded on first use. The vendor clients, the player and the company sign-in need
 * native modules (audio, crypto, keychain); Orca's components that offer voice import only this, so
 * they — and their tests — load none of that until a member actually speaks or listens.
 */
import type { CloudAsrOptions, CloudAsrSession } from './cloud-asr'
import type { CompanyVoiceVendor } from './company-voice'
import type { SpeechVoice } from './glwork-speech'

export type LoadedVoiceVendors =
  | { state: 'signed-out' }
  | { state: 'ready'; vendors: CompanyVoiceVendor[] }

export async function loadVoiceVendors(fresh = false): Promise<LoadedVoiceVendors> {
  const [{ loadCompanySession }, { fetchCompanyVoiceVendors }] = await Promise.all([
    import('../company-session'),
    import('./company-voice')
  ])
  const session = await loadCompanySession()
  if (!session) {
    return { state: 'signed-out' }
  }
  return { state: 'ready', vendors: await fetchCompanyVoiceVendors(session, fresh) }
}

/** Starts recognition with the chosen vendor: its token from the company, then its client. */
export async function startCloudAsr(
  vendorId: string,
  handlers: Pick<CloudAsrOptions, 'onText' | 'onError'>
): Promise<CloudAsrSession> {
  const [{ loadCompanySession }, { companyVoiceToken, fetchCompanyVoiceVendors }] =
    await Promise.all([import('../company-session'), import('./company-voice')])
  const session = await loadCompanySession()
  if (!session) {
    throw new Error('请先在 GL Work 里登录公司账号，才能用千问或火山识别。')
  }
  const vendor = (await fetchCompanyVoiceVendors(session)).find((entry) => entry.id === vendorId)
  if (!vendor?.asr) {
    throw new Error('管理员没有为你开放这个语音识别，请在「设置 → 语音」换一个。')
  }
  const token = await companyVoiceToken(session, vendorId)
  const options = { token: token.token, model: vendor.asr.model, ...handlers }
  if (vendor.protocol === 'dashscope') {
    const { startQwenAsr } = await import('./qwen-asr')
    return startQwenAsr(options)
  }
  const { startVolcAsr } = await import('./volc-asr')
  return startVolcAsr(options)
}

export async function speakGlWorkReply(markdown: string): Promise<void> {
  const speech = await import('./glwork-speech')
  await speech.speakGlWorkReply(markdown)
}

export async function speakWith(choice: SpeechVoice, markdown: string): Promise<void> {
  const speech = await import('./glwork-speech')
  await speech.speakWith(choice, markdown)
}

export async function previewVoice(sampleUrl: string): Promise<void> {
  const speech = await import('./glwork-speech')
  await speech.previewVoice(sampleUrl)
}
