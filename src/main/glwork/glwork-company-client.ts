import type { GlWorkModelVendor } from '../../shared/glwork-account-types'

/** The company service GL Work signs in to. */
export const GLWORK_DEFAULT_SERVER = 'https://agent.glwork.net'
const REQUEST_TIMEOUT_MS = 15_000

/**
 * The company service's origin: GLWORK_SERVER for local development (http only on this
 * machine), otherwise the company's. The device token never goes anywhere else.
 */
export function glworkServerOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.GLWORK_SERVER?.trim()
  if (!configured) {
    return GLWORK_DEFAULT_SERVER
  }
  const url = new URL(configured)
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`GLWORK_SERVER must be https (or http on this machine): ${configured}`)
  }
  return url.origin
}

export type DeviceSignIn = {
  token: string
  member: string
  displayName: string
  expiresAt: number
}

async function companyFetch(server: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(new URL(path, server), {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
}

function readSignIn(body: unknown): DeviceSignIn | null {
  if (typeof body !== 'object' || body === null) {
    return null
  }
  const fields: Record<string, unknown> = { ...body }
  if (
    typeof fields.token !== 'string' ||
    typeof fields.member !== 'string' ||
    typeof fields.expiresAt !== 'number'
  ) {
    return null
  }
  return {
    token: fields.token,
    member: fields.member,
    displayName: typeof fields.displayName === 'string' ? fields.displayName : fields.member,
    expiresAt: fields.expiresAt
  }
}

/** Trade the one-time sign-in code (PKCE) for this computer's device token. */
export async function exchangeSignInCode(
  server: string,
  args: { code: string; verifier: string; deviceName: string }
): Promise<DeviceSignIn> {
  const response = await companyFetch(server, '/agent-work/auth/desktop/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: args.code,
      code_verifier: args.verifier,
      device_name: args.deviceName
    })
  })
  if (response.status === 403) {
    throw new Error('This GitHub account is not a company member, or it has been disabled.')
  }
  const signIn = response.ok ? readSignIn(await response.json()) : null
  if (!signIn) {
    throw new Error(`The company service refused the sign-in (${response.status}).`)
  }
  return signIn
}

/** Revoke this computer's device token at the company; best effort. */
export async function revokeDeviceToken(server: string, token: string): Promise<void> {
  try {
    await companyFetch(server, '/agent-work/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    })
  } catch {
    // Why: signing out must work offline; the token still expires on its own.
  }
}

function readVendor(value: unknown): GlWorkModelVendor | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const fields: Record<string, unknown> = { ...value }
  const { vendor, name, protocol, baseUrl, models } = fields
  if (
    typeof vendor !== 'string' ||
    typeof name !== 'string' ||
    (protocol !== 'anthropic' && protocol !== 'openai') ||
    typeof baseUrl !== 'string' ||
    !Array.isArray(models)
  ) {
    return null
  }
  const offered = models.flatMap((model: unknown) => {
    if (typeof model !== 'object' || model === null) {
      return []
    }
    const entry: Record<string, unknown> = { ...model }
    return typeof entry.id === 'string'
      ? [{ id: entry.id, name: typeof entry.name === 'string' ? entry.name : entry.id }]
      : []
  })
  return { vendor, name, protocol, baseUrl, models: offered }
}

export class CompanySignInExpired extends Error {}

/** The company models this member may use (GET /agent-work/models). */
export async function fetchCompanyModels(
  server: string,
  token: string
): Promise<GlWorkModelVendor[]> {
  const response = await companyFetch(server, '/agent-work/models', {
    headers: { authorization: `Bearer ${token}` }
  })
  if (response.status === 401) {
    throw new CompanySignInExpired('The company sign-in expired or was revoked.')
  }
  if (!response.ok) {
    throw new Error(`The company service answered ${response.status}.`)
  }
  const body: unknown = await response.json()
  const vendors =
    typeof body === 'object' && body !== null && 'vendors' in body && Array.isArray(body.vendors)
      ? body.vendors
      : []
  return vendors.flatMap((vendor: unknown) => {
    const read = readVendor(vendor)
    return read ? [read] : []
  })
}
