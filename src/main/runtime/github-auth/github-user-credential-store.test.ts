import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runAsGithubCaller, bindGithubCaller, currentGithubCaller } from './github-caller-context'
import { GithubUserCredentialStore } from './github-user-credential-store'
import { refreshExpiringGithubTokens } from './github-user-token-refresh'

const grant = (accessToken: string, expiresInSeconds: number | null = null) => ({
  accessToken,
  refreshToken: expiresInSeconds === null ? null : `refresh-${accessToken}`,
  expiresInSeconds,
  refreshTokenExpiresInSeconds: null
})

describe('GithubUserCredentialStore', () => {
  it('persists credentials and keeps the token files a helper reads in step', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-gh-store-'))
    const store = new GithubUserCredentialStore(userDataPath, () => 1_000)
    store.save({ id: 7, login: 'carol', name: ' Carol ' }, grant('gho_one', 3600))

    const reloaded = new GithubUserCredentialStore(userDataPath).get(7)
    expect(reloaded).toMatchObject({
      login: 'carol',
      name: 'Carol',
      accessToken: 'gho_one',
      refreshToken: 'refresh-gho_one',
      expiresAt: 1_000 + 3_600_000
    })
    const { tokenFile, ghConfigDir } = store.paths(7)
    expect(readFileSync(tokenFile, 'utf-8')).toBe('gho_one\n')
    expect(readFileSync(join(ghConfigDir, 'hosts.yml'), 'utf-8')).toContain('oauth_token: gho_one')
    if (process.platform !== 'win32') {
      expect(statSync(tokenFile).mode & 0o077).toBe(0)
    }

    store.remove(7)
    expect(new GithubUserCredentialStore(userDataPath).get(7)).toBeNull()
    expect(existsSync(tokenFile)).toBe(false)
  })

  it('refreshes only tokens close to expiry', async () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-gh-store-'))
    const now = 0
    const store = new GithubUserCredentialStore(userDataPath, () => now)
    store.save({ id: 1, login: 'soon' }, grant('gho_soon', 10 * 60))
    store.save({ id: 2, login: 'later' }, grant('gho_later', 8 * 3600))
    store.save({ id: 3, login: 'classic' }, grant('gho_classic'))
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ access_token: 'gho_new', refresh_token: 'refresh-new', expires_in: 28_800 })
    )

    const result = await refreshExpiringGithubTokens({
      store,
      fetchFn,
      clientId: 'Iv1.x',
      clientSecret: 'secret',
      now: () => now
    })

    expect(result.refreshedUserIds).toEqual([1])
    expect(store.get(1)?.accessToken).toBe('gho_new')
    expect(readFileSync(store.paths(1).tokenFile, 'utf-8')).toBe('gho_new\n')
    expect(store.get(2)?.accessToken).toBe('gho_later')
    const body = String(fetchFn.mock.calls[0]?.[1]?.body)
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=refresh-gho_soon')
  })
})

describe('GitHub caller context', () => {
  it('follows the request through awaits and stays out of unrelated work', async () => {
    const identity = { userId: 1, login: 'octocat', boundAt: 0 }
    const seen = await runAsGithubCaller(identity, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return currentGithubCaller()
    })
    expect(seen).toEqual(identity)
    expect(currentGithubCaller()).toBeUndefined()

    const bound = bindGithubCaller(identity, async () => currentGithubCaller()?.login)
    expect(await bound()).toBe('octocat')
    const unbound = async () => currentGithubCaller()
    expect(bindGithubCaller(undefined, unbound)).toBe(unbound)
  })
})
