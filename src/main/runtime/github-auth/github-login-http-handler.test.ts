import { createServer, type Server } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { decodePairingOffer } from '../../../shared/pairing'
import { DeviceRegistry } from '../device-registry'
import { createGithubBoundPairingOffer } from './github-bound-pairing-offer'
import type { GithubDeviceLoginConfig } from './github-device-login-config'
import type { GithubFetch } from './github-device-flow-client'
import {
  GITHUB_LOGIN_DEVICE_PATH,
  GITHUB_LOGIN_POLL_PATH
} from '../../../shared/github-device-login-contract'
import { createGithubLoginRequestInterceptor } from './github-login-http-handler'
import { GithubLoginSessions } from './github-login-sessions'

const config: GithubDeviceLoginConfig = {
  clientId: 'Iv1.test',
  org: 'acme',
  allowedTeams: [],
  runtimeTeams: [],
  scope: 'read:org',
  orgToken: null,
  pairingAddress: 'wss://orca.example.com',
  requireIdentity: true,
  gitIdentityMode: 'author',
  clientSecret: null
}

type GithubScript = {
  tokenResponses: Record<string, unknown>[]
  membershipStatus?: number
  membershipState?: string
}

function fakeGithub(script: GithubScript): GithubFetch {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/login/device/code')) {
      return Response.json({
        device_code: 'secret-device-code',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5
      })
    }
    if (url.endsWith('/login/oauth/access_token')) {
      return Response.json(script.tokenResponses.shift() ?? { error: 'authorization_pending' })
    }
    if (url.endsWith('/user')) {
      return Response.json({ id: 42, login: 'octocat' })
    }
    if (url.includes('/orgs/acme/memberships/octocat')) {
      const status = script.membershipStatus ?? 200
      return status === 200
        ? Response.json({ state: script.membershipState ?? 'active' })
        : new Response(null, { status })
    }
    throw new Error(`unexpected GitHub call: ${url}`)
  })
}

const jsonObjectSchema = z.record(z.string(), z.unknown())

let server: Server | null = null
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

async function startHost(script: GithubScript, clock: { now: number }) {
  const paired: { login: string; accessToken: string }[] = []
  const registry = new DeviceRegistry(mkdtempSync(join(tmpdir(), 'orca-github-login-')))
  const source = {
    getWebSocketEndpoint: () => 'ws://0.0.0.0:6768',
    getDeviceRegistry: () => registry,
    getE2EEPublicKey: () => Buffer.alloc(32, 7).toString('base64')
  }
  const interceptor = createGithubLoginRequestInterceptor({
    config,
    fetchFn: fakeGithub(script),
    sessions: new GithubLoginSessions(() => clock.now),
    mintOffer: (args) =>
      createGithubBoundPairingOffer(source, { ...args, address: config.pairingAddress }),
    now: () => clock.now,
    onPaired: (user, grant) => paired.push({ login: user.login, accessToken: grant.accessToken })
  })
  const host = createServer((request, response) => {
    if (!interceptor(request, response)) {
      response.statusCode = 404
      response.end()
    }
  })
  server = host
  await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve))
  const address = host.address()
  if (!address || typeof address === 'string') {
    throw new Error('test server did not bind a TCP port')
  }
  const { port } = address
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return { status: response.status, body: jsonObjectSchema.parse(await response.json()) }
  }
  return { registry, post, port, paired }
}

describe('GitHub device login HTTP routes', () => {
  it('pairs an active org member and binds the new device to their GitHub identity', async () => {
    const clock = { now: 1_000_000 }
    const host = await startHost({ tokenResponses: [{ access_token: 'gho_user' }] }, clock)

    const start = await host.post(GITHUB_LOGIN_DEVICE_PATH, {
      client: 'mobile',
      deviceName: 'iPhone'
    })
    expect(start.status).toBe(200)
    expect(start.body).toMatchObject({ status: 'started', userCode: 'ABCD-1234', interval: 5 })
    expect(JSON.stringify(start.body)).not.toContain('secret-device-code')

    const poll = await host.post(GITHUB_LOGIN_POLL_PATH, { loginId: start.body.loginId })
    expect(poll.body).toMatchObject({ status: 'paired', githubLogin: 'octocat' })

    const offer = decodePairingOffer(String(poll.body.pairingUrl))
    expect(offer.endpoint).toBe('wss://orca.example.com')
    expect(offer.scope).toBe('mobile')
    const device = host.registry.validateToken(offer.deviceToken)
    expect(device).toMatchObject({
      name: 'iPhone · @octocat',
      scope: 'mobile',
      githubIdentity: { userId: 42, login: 'octocat', boundAt: 1_000_000 }
    })

    // Why: the grant is spent; a replayed loginId must not mint a second device.
    const replay = await host.post(GITHUB_LOGIN_POLL_PATH, { loginId: start.body.loginId })
    expect(replay.status).toBe(404)
    expect(host.registry.listDevices()).toHaveLength(1)
    expect(host.paired).toEqual([{ login: 'octocat', accessToken: 'gho_user' }])
  })

  it('refuses non-members and pending invitations without creating a device', async () => {
    for (const script of [
      { tokenResponses: [{ access_token: 'gho_user' }], membershipStatus: 404 },
      { tokenResponses: [{ access_token: 'gho_user' }], membershipState: 'pending' }
    ]) {
      const host = await startHost(script, { now: 0 })
      const start = await host.post(GITHUB_LOGIN_DEVICE_PATH, {
        client: 'runtime',
        deviceName: 'Mac'
      })
      const poll = await host.post(GITHUB_LOGIN_POLL_PATH, { loginId: start.body.loginId })
      expect(poll).toEqual({ status: 403, body: { status: 'forbidden', reason: 'not_org_member' } })
      expect(host.registry.listDevices()).toHaveLength(0)
      const current = server
      await new Promise<void>((resolve) => (current ? current.close(() => resolve()) : resolve()))
      server = null
    }
  })

  it('does not pair when GitHub cannot confirm membership', async () => {
    const host = await startHost(
      { tokenResponses: [{ access_token: 'gho_user' }], membershipStatus: 500 },
      { now: 0 }
    )
    const start = await host.post(GITHUB_LOGIN_DEVICE_PATH, {
      client: 'mobile',
      deviceName: 'Pixel'
    })
    const poll = await host.post(GITHUB_LOGIN_POLL_PATH, { loginId: start.body.loginId })
    expect(poll.status).toBe(502)
    expect(host.registry.listDevices()).toHaveLength(0)
  })

  it('honours the GitHub poll interval and slow_down', async () => {
    const clock = { now: 0 }
    const host = await startHost(
      { tokenResponses: [{ error: 'slow_down', interval: 10 }, { access_token: 'gho_user' }] },
      clock
    )
    const start = await host.post(GITHUB_LOGIN_DEVICE_PATH, {
      client: 'mobile',
      deviceName: 'iPad'
    })
    const loginId = start.body.loginId

    expect((await host.post(GITHUB_LOGIN_POLL_PATH, { loginId })).body.status).toBe('pending')
    clock.now += 5_000
    // Why: slow_down raised the interval to 10s, so a 5s-later poll must not reach GitHub.
    expect((await host.post(GITHUB_LOGIN_POLL_PATH, { loginId })).body.status).toBe('pending')
    clock.now += 5_000
    expect((await host.post(GITHUB_LOGIN_POLL_PATH, { loginId })).body.status).toBe('paired')
  })

  it('reports a denied authorization and forgets the login', async () => {
    const host = await startHost({ tokenResponses: [{ error: 'access_denied' }] }, { now: 0 })
    const start = await host.post(GITHUB_LOGIN_DEVICE_PATH, { client: 'mobile', deviceName: 'x' })
    expect((await host.post(GITHUB_LOGIN_POLL_PATH, { loginId: start.body.loginId })).body).toEqual(
      {
        status: 'denied'
      }
    )
    expect((await host.post(GITHUB_LOGIN_POLL_PATH, { loginId: start.body.loginId })).status).toBe(
      404
    )
  })

  it('rejects malformed requests and other methods, and ignores unrelated paths', async () => {
    const host = await startHost({ tokenResponses: [] }, { now: 0 })
    expect((await host.post(GITHUB_LOGIN_DEVICE_PATH, { client: 'root' })).status).toBe(400)
    const get = await fetch(`http://127.0.0.1:${host.port}${GITHUB_LOGIN_DEVICE_PATH}`)
    expect(get.status).toBe(405)
    const other = await fetch(`http://127.0.0.1:${host.port}/web-index.html`)
    expect(other.status).toBe(404)
  })
})
