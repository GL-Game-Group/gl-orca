import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import type { HandlerContext } from '../dispatch'

const { addEnvironmentFromPairingCodeMock } = vi.hoisted(() => ({
  addEnvironmentFromPairingCodeMock: vi.fn()
}))

vi.mock('../runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock
}))
import { createEnvironmentLoginHandler } from './environment-github-login'

function context(flags: Record<string, string>): HandlerContext {
  return {
    client: new RuntimeClient('/tmp/orca-cli-test-unused', 500),
    cwd: '/tmp',
    flags: new Map(Object.entries(flags)),
    json: true,
    rawArgs: []
  }
}

const started = {
  status: 'started',
  loginId: 'login-1',
  userCode: 'WXYZ-9876',
  verificationUri: 'https://github.com/login/device',
  expiresIn: 900,
  interval: 1
}

describe('orca environment login', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  beforeEach(() => {
    vi.stubEnv('ORCA_USER_DATA_PATH', '/tmp/orca-user-data')
    addEnvironmentFromPairingCodeMock.mockReset().mockReturnValue({
      id: 'env-1',
      name: 'office',
      endpoints: [],
      createdAt: 1,
      updatedAt: 1
    })
  })

  it('prints the GitHub code to stderr, then saves the minted pairing', async () => {
    const responses: unknown[] = [
      started,
      { status: 'paired', pairingUrl: 'orca://pair?code=minted', githubLogin: 'octocat' }
    ]
    const fetchFn = vi.fn(async () => Response.json(responses.shift()))
    const progress: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await createEnvironmentLoginHandler(fetchFn, (line) => progress.push(line))(
      context({ name: 'office', server: 'orca.example.com' })
    )

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://orca.example.com/auth/github/device',
      expect.objectContaining({ method: 'POST' })
    )
    expect(progress[0]).toBe('Open https://github.com/login/device and enter code WXYZ-9876')
    expect(addEnvironmentFromPairingCodeMock).toHaveBeenCalledWith('/tmp/orca-user-data', {
      name: 'office',
      pairingCode: 'orca://pair?code=minted'
    })
    expect(String(logSpy.mock.calls[0]?.[0])).toContain('"githubLogin": "octocat"')
    logSpy.mockRestore()
  })

  it('refuses a plain-http server and a denied sign-in without saving anything', async () => {
    await expect(
      createEnvironmentLoginHandler(vi.fn())(
        context({ name: 'office', server: 'http://orca.example.com' })
      )
    ).rejects.toThrow(/https/)

    const responses: unknown[] = [started, { status: 'forbidden', reason: 'not_org_member' }]
    await expect(
      createEnvironmentLoginHandler(
        vi.fn(async () => Response.json(responses.shift())),
        () => {}
      )(context({ name: 'office', server: 'https://orca.example.com' }))
    ).rejects.toThrow(/not a member/)
    expect(addEnvironmentFromPairingCodeMock).not.toHaveBeenCalled()
  })
})
