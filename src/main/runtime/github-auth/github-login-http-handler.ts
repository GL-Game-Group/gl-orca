// Pre-auth HTTP routes: start a GitHub device-flow sign-in, then poll until it yields a pairing offer.
// Anonymous by design, so every path is size-, rate- and table-bounded and never reveals host state.
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  GITHUB_LOGIN_DEVICE_PATH,
  GITHUB_LOGIN_POLL_PATH,
  githubLoginPollRequestSchema,
  githubLoginStartRequestSchema
} from '../../../shared/github-device-login-contract'
import type { DeviceGithubIdentity, DeviceScope } from '../device-registry'
import type { HttpRequestInterceptor } from '../rpc/ws-transport'
import type { GithubBoundPairingOffer } from './github-bound-pairing-offer'
import type { GithubDeviceLoginConfig } from './github-device-login-config'
import {
  checkGithubAccess,
  fetchGithubUser,
  pollGithubDeviceToken,
  requestGithubDeviceCode,
  type GithubFetch,
  type GithubUserTokenGrant
} from './github-device-flow-client'
import type { GithubLoginSessions } from './github-login-sessions'

const MAX_BODY_BYTES = 4096

export type GithubLoginHttpDeps = {
  config: GithubDeviceLoginConfig
  fetchFn: GithubFetch
  sessions: GithubLoginSessions
  mintOffer: (args: {
    deviceName: string
    scope: DeviceScope
    githubIdentity: DeviceGithubIdentity
  }) => GithubBoundPairingOffer
  now?: () => number
  /** Called once a member's device is paired, with the grant that proved it. */
  onPaired?: (
    user: { id: number; login: string; name?: string | null },
    grant: GithubUserTokenGrant
  ) => void
}

function writeJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('body_too_large')
    }
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

async function handleStart(deps: GithubLoginHttpDeps, body: unknown, response: ServerResponse) {
  const parsed = githubLoginStartRequestSchema.safeParse(body)
  if (!parsed.success) {
    writeJson(response, 400, { status: 'error', reason: 'invalid_request' })
    return
  }
  if (!deps.sessions.admitStart()) {
    writeJson(response, 429, { status: 'error', reason: 'rate_limited' })
    return
  }
  const code = await requestGithubDeviceCode(deps.fetchFn, deps.config.clientId, deps.config.scope)
  const loginId = deps.sessions.create({
    deviceCode: code.deviceCode,
    scope: parsed.data.client,
    deviceName: parsed.data.deviceName,
    expiresInSeconds: code.expiresInSeconds,
    intervalSeconds: code.intervalSeconds
  })
  if (!loginId) {
    writeJson(response, 429, { status: 'error', reason: 'too_many_pending_logins' })
    return
  }
  writeJson(response, 200, {
    status: 'started',
    loginId,
    userCode: code.userCode,
    verificationUri: code.verificationUri,
    expiresIn: code.expiresInSeconds,
    interval: code.intervalSeconds
  })
}

async function authorizeGrant(
  deps: GithubLoginHttpDeps,
  accessToken: string,
  scope: DeviceScope
): Promise<
  | {
      ok: true
      identity: DeviceGithubIdentity
      user: { id: number; login: string; name?: string | null }
    }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const { config, fetchFn } = deps
  const user = await fetchGithubUser(fetchFn, accessToken)
  const access = await checkGithubAccess(
    fetchFn,
    accessToken,
    config.org,
    config.allowedTeams,
    user.login
  )
  if (access === 'unverifiable') {
    return { ok: false, status: 502, body: { status: 'error', reason: 'github_unavailable' } }
  }
  if (access === 'not-member') {
    return { ok: false, status: 403, body: { status: 'forbidden', reason: 'not_org_member' } }
  }
  if (scope === 'runtime' && config.runtimeTeams.length > 0) {
    const runtimeAccess = await checkGithubAccess(
      fetchFn,
      accessToken,
      config.org,
      config.runtimeTeams,
      user.login
    )
    if (runtimeAccess !== 'member') {
      return {
        ok: false,
        status: 403,
        body: { status: 'forbidden', reason: 'runtime_not_allowed' }
      }
    }
  }
  const now = deps.now ?? Date.now
  return { ok: true, identity: { userId: user.id, login: user.login, boundAt: now() }, user }
}

async function handlePoll(deps: GithubLoginHttpDeps, body: unknown, response: ServerResponse) {
  const parsed = githubLoginPollRequestSchema.safeParse(body)
  if (!parsed.success) {
    writeJson(response, 400, { status: 'error', reason: 'invalid_request' })
    return
  }
  const { loginId } = parsed.data
  const claim = deps.sessions.beginPoll(loginId)
  if (!claim) {
    writeJson(response, 404, { status: 'expired' })
    return
  }
  const intervalSeconds = Math.ceil(claim.login.intervalMs / 1000)
  if (!claim.ready) {
    writeJson(response, 200, { status: 'pending', interval: intervalSeconds })
    return
  }
  let poll
  try {
    poll = await pollGithubDeviceToken(deps.fetchFn, deps.config.clientId, claim.login.deviceCode)
  } catch (error) {
    deps.sessions.endPoll(loginId)
    throw error
  }
  if (poll.kind === 'pending' || poll.kind === 'slow-down') {
    deps.sessions.endPoll(loginId, poll.kind === 'slow-down' ? poll.intervalSeconds : undefined)
    writeJson(response, 200, { status: 'pending', interval: intervalSeconds })
    return
  }
  // Why: every remaining outcome consumes the device code, so the login cannot be polled again.
  deps.sessions.delete(loginId)
  if (poll.kind !== 'token') {
    writeJson(response, 200, { status: poll.kind })
    return
  }
  const authorization = await authorizeGrant(deps, poll.grant.accessToken, claim.login.scope)
  if (!authorization.ok) {
    writeJson(response, authorization.status, authorization.body)
    return
  }
  const offer = deps.mintOffer({
    deviceName: `${claim.login.deviceName} · @${authorization.identity.login}`,
    scope: claim.login.scope,
    githubIdentity: authorization.identity
  })
  if (!offer.ok) {
    writeJson(response, 503, { status: 'error', reason: offer.reason })
    return
  }
  try {
    deps.onPaired?.(authorization.user, poll.grant)
  } catch (error) {
    // Why: the device is already paired; losing per-user git identity must not fail the sign-in.
    console.warn('[github-login] Could not store GitHub user credentials:', error)
  }
  console.log(
    `[github-login] Paired ${claim.login.scope} device ${offer.deviceId} for @${authorization.identity.login}`
  )
  writeJson(response, 200, {
    status: 'paired',
    pairingUrl: offer.pairingUrl,
    githubLogin: authorization.identity.login
  })
}

export function createGithubLoginRequestInterceptor(
  deps: GithubLoginHttpDeps
): HttpRequestInterceptor {
  return (request, response) => {
    const pathname = (request.url ?? '').split('?')[0]
    const route =
      pathname === GITHUB_LOGIN_DEVICE_PATH
        ? handleStart
        : pathname === GITHUB_LOGIN_POLL_PATH
          ? handlePoll
          : null
    if (!route) {
      return false
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      writeJson(response, 405, { status: 'error', reason: 'method_not_allowed' })
      return true
    }
    void readJsonBody(request)
      .then((body) => route(deps, body, response))
      .catch((error: unknown) => {
        if (response.headersSent) {
          return
        }
        const tooLarge = error instanceof Error && error.message === 'body_too_large'
        const badJson = error instanceof SyntaxError
        if (!tooLarge && !badJson) {
          console.warn(
            '[github-login] GitHub request failed:',
            error instanceof Error ? error.message : error
          )
        }
        writeJson(response, tooLarge ? 413 : badJson ? 400 : 502, {
          status: 'error',
          reason: tooLarge ? 'body_too_large' : badJson ? 'invalid_request' : 'github_unavailable'
        })
      })
    return true
  }
}
