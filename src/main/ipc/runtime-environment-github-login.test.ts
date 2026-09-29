import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

import { GithubRemoteHostLogins } from './runtime-environment-github-login'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../../shared/remote-pairing-verification'

const started = {
  status: 'started',
  loginId: 'login-1',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  expiresIn: 900,
  interval: 1
}

const savedResult: VerifyAndAddRuntimeEnvironmentResult = {
  ok: true,
  environment: {
    id: 'env-1',
    name: 'office',
    createdAt: 1,
    updatedAt: 1,
    lastUsedAt: null,
    runtimeId: 'runtime-1',
    endpoints: [
      { id: 'e1', kind: 'websocket', label: 'office', endpoint: 'wss://orca.example.com' }
    ],
    preferredEndpointId: 'e1'
  },
  runtimeStatus: {
    runtimeId: 'runtime-1',
    rendererGraphEpoch: 0,
    graphStatus: 'ready',
    authoritativeWindowId: null,
    liveTabCount: 0,
    liveLeafCount: 0
  }
}

function scriptedFetch(responses: unknown[]) {
  return vi.fn(async () => Response.json(responses.shift()))
}

describe('GithubRemoteHostLogins', () => {
  it('saves the minted pairing through verify-and-add', async () => {
    const verifyAndAdd = vi.fn(
      async (): Promise<VerifyAndAddRuntimeEnvironmentResult> => savedResult
    )
    const logins = new GithubRemoteHostLogins(
      verifyAndAdd,
      scriptedFetch([
        started,
        { status: 'paired', pairingUrl: 'orca://pair?code=minted', githubLogin: 'octocat' }
      ]),
      'test-mac'
    )

    const start = await logins.start('orca.example.com')
    expect(start).toMatchObject({ ok: true, userCode: 'ABCD-1234' })
    if (!start.ok) {
      return
    }
    const result = await logins.complete(start.loginKey, 'office')

    expect(verifyAndAdd).toHaveBeenCalledWith({
      name: 'office',
      pairingCode: 'orca://pair?code=minted'
    })
    expect(result).toBe(savedResult)
    // Why: a finished login key must not be completable twice.
    expect(await logins.complete(start.loginKey, 'office')).toMatchObject({
      kind: 'github-login-cancelled'
    })
  })

  it('reports org refusal without saving anything', async () => {
    const verifyAndAdd = vi.fn(
      async (): Promise<VerifyAndAddRuntimeEnvironmentResult> => savedResult
    )
    const logins = new GithubRemoteHostLogins(
      verifyAndAdd,
      scriptedFetch([started, { status: 'forbidden', reason: 'not_org_member' }]),
      'test-mac'
    )
    const start = await logins.start('https://orca.example.com')
    if (!start.ok) {
      throw new Error('start failed')
    }
    expect(await logins.complete(start.loginKey, 'office')).toMatchObject({
      ok: false,
      kind: 'github-login-failed',
      message: expect.stringMatching(/not a member/)
    })
    expect(verifyAndAdd).not.toHaveBeenCalled()
  })

  it('stops waiting when cancelled', async () => {
    const verifyAndAdd = vi.fn(
      async (): Promise<VerifyAndAddRuntimeEnvironmentResult> => savedResult
    )
    const logins = new GithubRemoteHostLogins(verifyAndAdd, scriptedFetch([started]), 'test-mac')
    const start = await logins.start('https://orca.example.com')
    if (!start.ok) {
      throw new Error('start failed')
    }
    const completion = logins.complete(start.loginKey, 'office')
    logins.cancel(start.loginKey)
    expect(await completion).toMatchObject({ kind: 'github-login-cancelled' })
    expect(verifyAndAdd).not.toHaveBeenCalled()
  })

  it('rejects plain-http servers before contacting them', async () => {
    const fetchFn = vi.fn(async () => Response.json({}))
    const logins = new GithubRemoteHostLogins(async () => savedResult, fetchFn, 'test-mac')
    expect(await logins.start('http://orca.example.com')).toMatchObject({ ok: false })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})
