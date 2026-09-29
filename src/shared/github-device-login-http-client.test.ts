import { describe, expect, it, vi } from 'vitest'
import {
  normalizeGithubLoginServer,
  startGithubLogin,
  waitForGithubLogin,
  type GithubLoginFetch
} from './github-device-login-http-client'

const started = {
  status: 'started' as const,
  loginId: 'login-1',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  expiresIn: 900,
  interval: 5
}

function scriptedFetch(responses: unknown[]): GithubLoginFetch {
  return vi.fn(async () => Response.json(responses.shift()))
}

describe('normalizeGithubLoginServer', () => {
  it('defaults to https and keeps only the origin', () => {
    expect(normalizeGithubLoginServer(' orca.example.com/path ')).toEqual({
      ok: true,
      origin: 'https://orca.example.com'
    })
  })

  it('refuses plain http except on loopback', () => {
    expect(normalizeGithubLoginServer('http://orca.example.com').ok).toBe(false)
    expect(normalizeGithubLoginServer('http://127.0.0.1:6768')).toEqual({
      ok: true,
      origin: 'http://127.0.0.1:6768'
    })
    expect(normalizeGithubLoginServer('').ok).toBe(false)
  })
})

describe('GitHub login client', () => {
  it('starts, waits at the host interval, and returns the pairing url', async () => {
    const fetchFn = scriptedFetch([
      started,
      { status: 'pending', interval: 10 },
      { status: 'paired', pairingUrl: 'orca://pair?code=x', githubLogin: 'octocat' }
    ])
    const sleeps: number[] = []
    const start = await startGithubLogin(fetchFn, 'https://orca.example.com', {
      client: 'mobile',
      deviceName: 'iPhone'
    })
    expect(start).toEqual({ ok: true, started })
    if (!start.ok) {
      return
    }

    const outcome = await waitForGithubLogin(fetchFn, 'https://orca.example.com', start.started, {
      sleep: async (ms) => {
        sleeps.push(ms)
      }
    })

    expect(outcome).toEqual({
      kind: 'paired',
      pairingUrl: 'orca://pair?code=x',
      githubLogin: 'octocat'
    })
    expect(sleeps).toEqual([5000, 10000])
    expect(fetchFn).toHaveBeenLastCalledWith(
      'https://orca.example.com/auth/github/poll',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ loginId: 'login-1' }) })
    )
  })

  it('turns terminal host answers into readable failures', async () => {
    for (const [response, message] of [
      [{ status: 'forbidden', reason: 'not_org_member' }, /not a member/],
      [{ status: 'denied' }, /cancelled/],
      [{ status: 'expired' }, /expired/],
      [{ status: 'error', reason: 'github_unavailable' }, /could not reach GitHub/]
    ] as const) {
      const outcome = await waitForGithubLogin(scriptedFetch([response]), 'https://h', started, {
        sleep: async () => {}
      })
      expect(outcome.kind).toBe('failed')
      expect(outcome.kind === 'failed' ? outcome.message : '').toMatch(message)
    }
  })

  it('reports a host that does not offer GitHub sign-in', async () => {
    const start = await startGithubLogin(scriptedFetch([{ hello: 'world' }]), 'https://h', {
      client: 'runtime',
      deviceName: 'Mac'
    })
    expect(start).toEqual({ ok: false, message: 'https://h does not offer GitHub sign-in.' })
  })
})
