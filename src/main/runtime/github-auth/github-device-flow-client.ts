// GitHub device-flow and membership calls. `fetchFn` is injected so tests never reach github.com.
import { z } from 'zod'

export type GithubFetch = (url: string, init: RequestInit) => Promise<Response>

const GITHUB_WEB_ORIGIN = 'https://github.com'
const GITHUB_API_ORIGIN = 'https://api.github.com'
const REQUEST_TIMEOUT_MS = 15_000
const DEVICE_FLOW_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

const deviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive()
})

const tokenResponseSchema = z.union([
  z.object({
    access_token: z.string().min(1),
    // Why: only GitHub Apps with expiring user tokens return these; classic OAuth tokens never expire.
    refresh_token: z.string().min(1).optional(),
    expires_in: z.number().int().positive().optional(),
    refresh_token_expires_in: z.number().int().positive().optional()
  }),
  z.object({ error: z.string().min(1), interval: z.number().int().positive().optional() })
])

const userResponseSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable().optional()
})
const membershipResponseSchema = z.object({ state: z.string() })

export type GithubDeviceCode = {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresInSeconds: number
  intervalSeconds: number
}

export type GithubTokenPoll =
  | { kind: 'pending' }
  | { kind: 'slow-down'; intervalSeconds: number }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'token'; grant: GithubUserTokenGrant }

export type GithubUserTokenGrant = {
  accessToken: string
  refreshToken: string | null
  expiresInSeconds: number | null
  refreshTokenExpiresInSeconds: number | null
}

function toGrant(parsed: {
  access_token: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
}): GithubUserTokenGrant {
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresInSeconds: parsed.expires_in ?? null,
    refreshTokenExpiresInSeconds: parsed.refresh_token_expires_in ?? null
  }
}

/** `unverifiable` means GitHub could not answer; callers must never treat it as `not-member`. */
export type GithubMembershipVerdict = 'member' | 'not-member' | 'unverifiable'

function formHeaders(): Record<string, string> {
  return { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }
}

function apiHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Orca'
  }
}

export async function requestGithubDeviceCode(
  fetchFn: GithubFetch,
  clientId: string,
  scope: string
): Promise<GithubDeviceCode> {
  const response = await fetchFn(`${GITHUB_WEB_ORIGIN}/login/device/code`, {
    method: 'POST',
    headers: formHeaders(),
    body: new URLSearchParams({ client_id: clientId, scope }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`GitHub device code request failed with HTTP ${response.status}`)
  }
  const parsed = deviceCodeResponseSchema.parse(await response.json())
  return {
    deviceCode: parsed.device_code,
    userCode: parsed.user_code,
    verificationUri: parsed.verification_uri,
    expiresInSeconds: parsed.expires_in,
    intervalSeconds: parsed.interval
  }
}

export async function pollGithubDeviceToken(
  fetchFn: GithubFetch,
  clientId: string,
  deviceCode: string
): Promise<GithubTokenPoll> {
  const response = await fetchFn(`${GITHUB_WEB_ORIGIN}/login/oauth/access_token`, {
    method: 'POST',
    headers: formHeaders(),
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: DEVICE_FLOW_GRANT_TYPE
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`GitHub token poll failed with HTTP ${response.status}`)
  }
  const parsed = tokenResponseSchema.parse(await response.json())
  if ('access_token' in parsed) {
    return { kind: 'token', grant: toGrant(parsed) }
  }
  switch (parsed.error) {
    case 'authorization_pending':
      return { kind: 'pending' }
    case 'slow_down':
      return { kind: 'slow-down', intervalSeconds: parsed.interval ?? 10 }
    case 'access_denied':
      return { kind: 'denied' }
    case 'expired_token':
      return { kind: 'expired' }
    default:
      throw new Error(`GitHub token poll returned ${parsed.error}`)
  }
}

export async function fetchGithubUser(
  fetchFn: GithubFetch,
  accessToken: string
): Promise<{ id: number; login: string; name?: string | null }> {
  const response = await fetchFn(`${GITHUB_API_ORIGIN}/user`, {
    headers: apiHeaders(accessToken),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`GitHub user lookup failed with HTTP ${response.status}`)
  }
  return userResponseSchema.parse(await response.json())
}

/** Rotates an expiring GitHub App user token; GitHub requires the app's client secret for this grant. */
export async function refreshGithubUserToken(
  fetchFn: GithubFetch,
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<GithubUserTokenGrant> {
  const response = await fetchFn(`${GITHUB_WEB_ORIGIN}/login/oauth/access_token`, {
    method: 'POST',
    headers: formHeaders(),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(`GitHub token refresh failed with HTTP ${response.status}`)
  }
  const parsed = tokenResponseSchema.parse(await response.json())
  if (!('access_token' in parsed)) {
    throw new Error(`GitHub token refresh returned ${parsed.error}`)
  }
  return toGrant(parsed)
}

async function activeMembershipVerdict(
  fetchFn: GithubFetch,
  token: string,
  url: string
): Promise<GithubMembershipVerdict> {
  let response: Response
  try {
    response = await fetchFn(url, {
      headers: apiHeaders(token),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch {
    return 'unverifiable'
  }
  if (response.status === 404) {
    return 'not-member'
  }
  if (!response.ok) {
    return 'unverifiable'
  }
  const parsed = membershipResponseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    return 'unverifiable'
  }
  // Why: a pending invitation is not membership yet.
  return parsed.data.state === 'active' ? 'member' : 'not-member'
}

/** Works with the signing-in user's own token (needs read:org or the Members permission). */
export function checkGithubOrgMembership(
  fetchFn: GithubFetch,
  token: string,
  org: string,
  login: string
): Promise<GithubMembershipVerdict> {
  return activeMembershipVerdict(
    fetchFn,
    token,
    `${GITHUB_API_ORIGIN}/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(login)}`
  )
}

export function checkGithubTeamMembership(
  fetchFn: GithubFetch,
  token: string,
  org: string,
  team: string,
  login: string
): Promise<GithubMembershipVerdict> {
  return activeMembershipVerdict(
    fetchFn,
    token,
    `${GITHUB_API_ORIGIN}/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}/memberships/${encodeURIComponent(login)}`
  )
}

/** Member of the org and, when teams are listed, of at least one of them. */
export async function checkGithubAccess(
  fetchFn: GithubFetch,
  token: string,
  org: string,
  teams: readonly string[],
  login: string
): Promise<GithubMembershipVerdict> {
  const orgVerdict = await checkGithubOrgMembership(fetchFn, token, org, login)
  if (orgVerdict !== 'member' || teams.length === 0) {
    return orgVerdict
  }
  let sawUnverifiable = false
  for (const team of teams) {
    const verdict = await checkGithubTeamMembership(fetchFn, token, org, team, login)
    if (verdict === 'member') {
      return 'member'
    }
    sawUnverifiable ||= verdict === 'unverifiable'
  }
  return sawUnverifiable ? 'unverifiable' : 'not-member'
}
