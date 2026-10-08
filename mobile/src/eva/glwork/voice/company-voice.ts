import { companyCall } from '../company-client'
import type { CompanySession } from '../company-socket'

/** One voice a vendor offers for read-aloud, as the company service opens it (GET /agent-work/phone/voice). */
export type CompanyVoiceOption = {
  id: string
  name: string
  description: string | null
  gender: 'female' | 'male' | null
  /** The vendor's own recording of this voice, for previews. */
  sampleUrl: string | null
}

export type CompanyVoiceVendor = {
  id: string
  name: string
  protocol: 'dashscope' | 'volcengine'
  /** Speech recognition, when the administrator turned it on for this member. */
  asr: { model: string } | null
  /** Read-aloud and its voices, when turned on. */
  tts: { model: string; voices: CompanyVoiceOption[] } | null
}

/** What the phone sends to a vendor: a short-lived DashScope token, or Volcengine's API key made for GL Work. */
export type CompanyVoiceToken = {
  vendor: string
  protocol: 'dashscope' | 'volcengine'
  token: string
  expiresAt: number
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function readVoice(value: unknown): CompanyVoiceOption | null {
  const voice = record(value)
  const id = text(voice.id)
  if (!id) {
    return null
  }
  return {
    id,
    name: text(voice.name) ?? id,
    description: text(voice.description),
    gender: voice.gender === 'female' || voice.gender === 'male' ? voice.gender : null,
    sampleUrl: text(voice.sampleUrl)
  }
}

function readVendor(value: unknown): CompanyVoiceVendor | null {
  const vendor = record(value)
  const id = text(vendor.id)
  const protocol = vendor.protocol
  if (!id || (protocol !== 'dashscope' && protocol !== 'volcengine')) {
    return null
  }
  const asr = record(vendor.asr)
  const tts = record(vendor.tts)
  const voices = Array.isArray(tts.voices) ? tts.voices : []
  return {
    id,
    name: text(vendor.name) ?? id,
    protocol,
    asr: text(asr.model) ? { model: String(asr.model) } : null,
    tts: text(tts.model)
      ? {
          model: String(tts.model),
          voices: voices.flatMap((voice: unknown) => {
            const read = readVoice(voice)
            return read ? [read] : []
          })
        }
      : null
  }
}

const VENDORS_TTL_MS = 5 * 60_000
let vendorsCache: { token: string; at: number; vendors: CompanyVoiceVendor[] } | null = null

/** The voice vendors this member may use from the phone (kept a few minutes; `fresh` asks again). */
export async function fetchCompanyVoiceVendors(
  session: CompanySession,
  fresh = false
): Promise<CompanyVoiceVendor[]> {
  if (
    !fresh &&
    vendorsCache?.token === session.token &&
    Date.now() - vendorsCache.at < VENDORS_TTL_MS
  ) {
    return vendorsCache.vendors
  }
  const body = await companyCall(session.server, '/agent-work/phone/voice', {
    token: session.token
  })
  const vendors = Array.isArray(body.vendors) ? body.vendors : []
  const read = vendors.flatMap((vendor: unknown) => {
    const entry = readVendor(vendor)
    return entry ? [entry] : []
  })
  vendorsCache = { token: session.token, at: Date.now(), vendors: read }
  return read
}

const TOKEN_MARGIN_MS = 30_000
const tokens = new Map<string, CompanyVoiceToken>()

/** A vendor token, reused until shortly before it expires (the company counts how many a member takes). */
export async function companyVoiceToken(
  session: CompanySession,
  vendor: string
): Promise<CompanyVoiceToken> {
  const cached = tokens.get(vendor)
  if (cached && cached.expiresAt - TOKEN_MARGIN_MS > Date.now()) {
    return cached
  }
  const body = await companyCall(session.server, '/agent-work/phone/voice/token', {
    method: 'POST',
    token: session.token,
    body: JSON.stringify({ vendor })
  })
  const token = text(body.token)
  const protocol = body.protocol
  if (!token || (protocol !== 'dashscope' && protocol !== 'volcengine')) {
    throw new Error('公司服务没有返回语音令牌。')
  }
  const issued: CompanyVoiceToken = {
    vendor,
    protocol,
    token,
    expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : Date.now() + 5 * 60_000
  }
  tokens.set(vendor, issued)
  return issued
}
