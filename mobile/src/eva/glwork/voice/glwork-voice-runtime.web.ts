/**
 * The mobile web app has no GL Work voice (it needs the phone's native audio and keychain), so the
 * web bundle gets this instead of the vendor clients: no extra chunks against its asset budget.
 */
import type { CloudAsrSession } from './cloud-asr'
import type { CompanyVoiceToken, CompanyVoiceVendor } from './company-voice'
import type { CompanySession } from '../company-session'

function unavailable(): Error {
  return new Error('网页版不支持千问、火山语音，请在 GL Work 手机 App 里使用。')
}

export async function loadCompanySession(): Promise<CompanySession | null> {
  return null
}

export async function fetchCompanyVoiceVendors(): Promise<CompanyVoiceVendor[]> {
  return []
}

export async function companyVoiceToken(): Promise<CompanyVoiceToken> {
  throw unavailable()
}

export async function startQwenAsr(): Promise<CloudAsrSession> {
  throw unavailable()
}

export async function startVolcAsr(): Promise<CloudAsrSession> {
  throw unavailable()
}

export function startQwenFileAsr(): CloudAsrSession {
  throw unavailable()
}

export function startVolcFileAsr(): CloudAsrSession {
  throw unavailable()
}

export async function previewVoice(): Promise<void> {
  throw unavailable()
}

export async function speakGlWorkReply(): Promise<void> {
  throw unavailable()
}

export async function speakWith(): Promise<void> {
  throw unavailable()
}
