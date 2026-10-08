import { sha256 } from '@noble/hashes/sha256'
import * as ExpoCrypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import type { CompanySession } from './company-session'

/** Where the company's phone sign-in returns (agent-work gateway: PHONE_REDIRECT). */
const CALLBACK = 'glwork://auth'
const TIMEOUT_MS = 15_000

/** `dsh`: the earlier GL Work desktop, which this app cannot reach. */
export type CompanyHost = {
  id: string
  label: string
  client: 'orca' | 'dsh'
  online: boolean
  closed: boolean
}

/** The company service's error codes, as a member reads them; its refusals are already in Chinese. */
const ERROR_TEXT: Record<string, string> = {
  phone_not_allowed: '公司服务还没有更新到支持新版手机 App 的版本，请联系管理员。',
  unauthenticated: '公司账号的登录已失效，请重新登录。',
  not_found: '公司服务找不到这个功能或这台电脑。',
  invalid_request: '请求无效，请重试。',
  invalid_grant: '登录已过期，请重新登录。',
  access_denied: '这个 GitHub 账号不是公司成员，或已被停用。',
  pairing_unavailable: '这台电脑暂时无法配对，请确认它开着 GL Work。',
  forbidden: '这台电脑拒绝了配对请求。'
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {}
}

async function call(
  server: string,
  path: string,
  init: RequestInit & { token?: string }
): Promise<Record<string, unknown>> {
  const { token, ...rest } = init
  // Why not AbortSignal.timeout: Hermes does not implement it.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  let body: Record<string, unknown>
  try {
    response = await fetch(new URL(path, server).toString(), {
      ...rest,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(rest.body ? { 'content-type': 'application/json' } : {})
      },
      signal: controller.signal
    })
    body = record(await response.json().catch(() => null))
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    const code = typeof body.error === 'string' ? body.error : ''
    const reason = ERROR_TEXT[code] ?? (code || `公司服务返回了错误（HTTP ${response.status}）。`)
    throw new CompanyRequestFailed(reason, response.status)
  }
  return body
}

export class CompanyRequestFailed extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * GitHub sign-in through the company service in the system's web authentication sheet (PKCE):
 * the one-time code comes back to glwork://auth and is traded for the phone's token.
 * Resolves null when the member closes the sheet.
 */
export async function signInToCompany(
  server: string,
  deviceName: string
): Promise<CompanySession | null> {
  const verifier = base64url(ExpoCrypto.getRandomBytes(32))
  const state = base64url(ExpoCrypto.getRandomBytes(16))
  const challenge = base64url(sha256(new TextEncoder().encode(verifier)))
  const start = new URL('/agent-work/auth/phone/start', server)
  start.searchParams.set('code_challenge', challenge)
  start.searchParams.set('state', state)
  const result = await WebBrowser.openAuthSessionAsync(start.toString(), CALLBACK, {
    preferEphemeralSession: false
  })
  if (result.type !== 'success') {
    return null
  }
  const back = new URL(result.url)
  const code = back.searchParams.get('code')
  if (back.searchParams.get('state') !== state || !code) {
    throw new Error('没有从公司服务拿到登录结果，请重试。')
  }
  const body = await call(server, '/agent-work/auth/phone/token', {
    method: 'POST',
    body: JSON.stringify({ code, code_verifier: verifier, device_name: deviceName })
  })
  const { token, member, displayName, expiresAt } = body
  if (typeof token !== 'string' || typeof member !== 'string' || typeof expiresAt !== 'number') {
    throw new Error('公司服务返回的登录结果无法识别。')
  }
  return {
    server,
    token,
    member,
    displayName: typeof displayName === 'string' ? displayName : member,
    expiresAt
  }
}

/** The member's computers with remote access turned on. */
export async function listCompanyHosts(session: CompanySession): Promise<CompanyHost[]> {
  const body = await call(session.server, '/agent-work/remote/hosts', { token: session.token })
  const hosts = Array.isArray(body.hosts) ? body.hosts : []
  return hosts.flatMap((entry: unknown) => {
    const host = record(entry)
    return typeof host.id === 'string' && typeof host.label === 'string'
      ? [
          {
            id: host.id,
            label: host.label,
            client: host.client === 'orca' ? ('orca' as const) : ('dsh' as const),
            online: host.online === true,
            closed: host.closed === true
          }
        ]
      : []
  })
}

/** Where the phone reaches a computer: the company's relay for its tunnel (as the desktop advertises it). */
export function companyRelayEndpoint(server: string, hostId: string): string {
  const url = new URL(`/agent-work/remote/${hostId}/orca`, server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

/** Ask one computer, through the relay, for a pairing for this phone (an orca://pair URL). */
export async function pairWithCompanyHost(
  session: CompanySession,
  hostId: string,
  deviceName: string
): Promise<string> {
  const body = await call(session.server, `/agent-work/remote/${hostId}/orca/pair`, {
    method: 'POST',
    token: session.token,
    body: JSON.stringify({ deviceName })
  })
  if (typeof body.pairingUrl !== 'string') {
    throw new Error('这台电脑没有返回配对信息。')
  }
  return body.pairingUrl
}

/** Revoke the phone's company token; best effort, the local session goes either way. */
export async function signOutOfCompany(session: CompanySession): Promise<void> {
  try {
    await call(session.server, '/agent-work/auth/logout', { method: 'POST', token: session.token })
  } catch {
    // Offline: the token still expires on its own.
  }
}
