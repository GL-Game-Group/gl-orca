// Desktop side of "add a remote server by GitHub sign-in": runs the device flow against the host,
// then saves the minted pairing through the same verify-and-add path an access link uses.
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { ipcMain } from 'electron'
import {
  normalizeGithubLoginServer,
  startGithubLogin,
  waitForGithubLogin,
  type GithubLoginFetch
} from '../../shared/github-device-login-http-client'
import type { GithubLoginStarted } from '../../shared/github-device-login-contract'
import type {
  GithubRemoteHostLoginCompleteResult,
  GithubRemoteHostLoginStartResult
} from '../../shared/github-remote-host-login-types'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../../shared/remote-pairing-verification'

type VerifyAndAdd = (args: {
  name: string
  pairingCode: string
}) => Promise<VerifyAndAddRuntimeEnvironmentResult>

type PendingLogin = { origin: string; started: GithubLoginStarted; controller: AbortController }

export class GithubRemoteHostLogins {
  private readonly pending = new Map<string, PendingLogin>()

  constructor(
    private readonly verifyAndAdd: VerifyAndAdd,
    private readonly fetchFn: GithubLoginFetch = (url, init) => fetch(url, init),
    private readonly deviceName: string = hostname().slice(0, 64) || 'Orca desktop'
  ) {}

  async start(server: string): Promise<GithubRemoteHostLoginStartResult> {
    const normalized = normalizeGithubLoginServer(server)
    if (!normalized.ok) {
      return { ok: false, message: normalized.message }
    }
    const controller = new AbortController()
    let result: Awaited<ReturnType<typeof startGithubLogin>>
    try {
      result = await startGithubLogin(
        this.fetchFn,
        normalized.origin,
        { client: 'runtime', deviceName: this.deviceName },
        controller.signal
      )
    } catch {
      return { ok: false, message: `Could not reach ${normalized.origin}.` }
    }
    if (!result.ok) {
      return { ok: false, message: result.message }
    }
    const loginKey = randomUUID()
    this.pending.set(loginKey, { origin: normalized.origin, started: result.started, controller })
    return {
      ok: true,
      loginKey,
      userCode: result.started.userCode,
      verificationUri: result.started.verificationUri
    }
  }

  async complete(loginKey: string, name: string): Promise<GithubRemoteHostLoginCompleteResult> {
    const login = this.pending.get(loginKey)
    if (!login) {
      return cancelled()
    }
    try {
      const outcome = await waitForGithubLogin(this.fetchFn, login.origin, login.started, {
        signal: login.controller.signal
      })
      if (outcome.kind === 'failed') {
        return { ok: false, kind: 'github-login-failed', message: outcome.message }
      }
      return await this.verifyAndAdd({ name, pairingCode: outcome.pairingUrl })
    } catch {
      return login.controller.signal.aborted
        ? cancelled()
        : { ok: false, kind: 'github-login-failed', message: `Could not reach ${login.origin}.` }
    } finally {
      this.pending.delete(loginKey)
    }
  }

  cancel(loginKey: string): void {
    this.pending.get(loginKey)?.controller.abort()
    this.pending.delete(loginKey)
  }
}

function cancelled(): GithubRemoteHostLoginCompleteResult {
  return { ok: false, kind: 'github-login-cancelled', message: 'Sign-in was cancelled.' }
}

export const GITHUB_REMOTE_HOST_LOGIN_CHANNELS = [
  'runtimeEnvironments:githubLoginStart',
  'runtimeEnvironments:githubLoginComplete',
  'runtimeEnvironments:githubLoginCancel'
] as const

export function registerRuntimeEnvironmentGithubLoginHandlers(verifyAndAdd: VerifyAndAdd): void {
  const logins = new GithubRemoteHostLogins(verifyAndAdd)
  ipcMain.handle('runtimeEnvironments:githubLoginStart', (_event, args: { server: string }) =>
    logins.start(args.server)
  )
  ipcMain.handle(
    'runtimeEnvironments:githubLoginComplete',
    (_event, args: { loginKey: string; name: string }) => logins.complete(args.loginKey, args.name)
  )
  ipcMain.handle('runtimeEnvironments:githubLoginCancel', (_event, args: { loginKey: string }) =>
    logins.cancel(args.loginKey)
  )
}
