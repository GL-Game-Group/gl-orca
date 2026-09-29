// Per-GitHub-user tokens captured at sign-in, used to act as that user in git and gh.
// Tokens also live in per-user files so long-lived shells read the refreshed value at use time.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  hardenExistingSecureFile,
  writeSecureFile,
  writeSecureJsonFile
} from '../../../shared/secure-file'
import type { GithubUserTokenGrant } from './github-device-flow-client'

const STORE_FILENAME = 'github-user-credentials.json'
const USER_DIRNAME = 'github-users'

export type GithubUserCredential = {
  userId: number
  login: string
  name: string | null
  accessToken: string
  refreshToken: string | null
  /** Epoch ms; null for classic OAuth tokens, which do not expire. */
  expiresAt: number | null
  refreshTokenExpiresAt: number | null
  updatedAt: number
}

export type GithubUserCredentialPaths = {
  /** Plain-text token file a git credential helper reads at use time. */
  tokenFile: string
  /** GH_CONFIG_DIR holding hosts.yml, so `gh` also reads the current token per run. */
  ghConfigDir: string
}

function parseCredential(value: unknown): GithubUserCredential | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = Object.fromEntries(Object.entries(value))
  const { userId, login, accessToken } = record
  if (
    typeof userId !== 'number' ||
    !Number.isInteger(userId) ||
    typeof login !== 'string' ||
    typeof accessToken !== 'string' ||
    accessToken.length === 0
  ) {
    return null
  }
  const optionalNumber = (field: unknown): number | null =>
    typeof field === 'number' ? field : null
  return {
    userId,
    login,
    name: typeof record.name === 'string' ? record.name : null,
    accessToken,
    refreshToken: typeof record.refreshToken === 'string' ? record.refreshToken : null,
    expiresAt: optionalNumber(record.expiresAt),
    refreshTokenExpiresAt: optionalNumber(record.refreshTokenExpiresAt),
    updatedAt: optionalNumber(record.updatedAt) ?? 0
  }
}

export class GithubUserCredentialStore {
  private readonly storePath: string
  private readonly userRoot: string
  private credentials = new Map<number, GithubUserCredential>()

  constructor(
    userDataPath: string,
    private readonly now: () => number = Date.now
  ) {
    this.storePath = join(userDataPath, STORE_FILENAME)
    this.userRoot = join(userDataPath, USER_DIRNAME)
    this.load()
  }

  get(userId: number): GithubUserCredential | null {
    return this.credentials.get(userId) ?? null
  }

  list(): GithubUserCredential[] {
    return [...this.credentials.values()]
  }

  paths(userId: number): GithubUserCredentialPaths {
    const dir = join(this.userRoot, String(userId))
    return { tokenFile: join(dir, 'token'), ghConfigDir: join(dir, 'gh') }
  }

  save(
    user: { id: number; login: string; name?: string | null },
    grant: GithubUserTokenGrant
  ): GithubUserCredential {
    const now = this.now()
    const credential: GithubUserCredential = {
      userId: user.id,
      login: user.login,
      name: user.name?.trim() || null,
      accessToken: grant.accessToken,
      refreshToken: grant.refreshToken,
      expiresAt: grant.expiresInSeconds === null ? null : now + grant.expiresInSeconds * 1000,
      refreshTokenExpiresAt:
        grant.refreshTokenExpiresInSeconds === null
          ? null
          : now + grant.refreshTokenExpiresInSeconds * 1000,
      updatedAt: now
    }
    const next = new Map(this.credentials)
    next.set(user.id, credential)
    // Why: persist the token files first so a helper never reads a token the store has not recorded.
    this.writeUserFiles(credential)
    writeSecureJsonFile(this.storePath, [...next.values()])
    this.credentials = next
    return credential
  }

  remove(userId: number): void {
    if (!this.credentials.has(userId)) {
      return
    }
    const next = new Map(this.credentials)
    next.delete(userId)
    writeSecureJsonFile(this.storePath, [...next.values()])
    this.credentials = next
    rmSync(join(this.userRoot, String(userId)), { recursive: true, force: true })
  }

  private writeUserFiles(credential: GithubUserCredential): void {
    const { tokenFile, ghConfigDir } = this.paths(credential.userId)
    writeSecureFile(tokenFile, `${credential.accessToken}\n`)
    writeSecureFile(
      join(ghConfigDir, 'hosts.yml'),
      [
        'github.com:',
        `    oauth_token: ${credential.accessToken}`,
        `    user: ${credential.login}`,
        '    git_protocol: https',
        ''
      ].join('\n')
    )
  }

  private load(): void {
    if (!existsSync(this.storePath)) {
      return
    }
    try {
      hardenExistingSecureFile(this.storePath)
      const parsed: unknown = JSON.parse(readFileSync(this.storePath, 'utf-8'))
      const rows = Array.isArray(parsed) ? parsed : []
      for (const row of rows) {
        const credential = parseCredential(row)
        if (credential) {
          this.credentials.set(credential.userId, credential)
        }
      }
    } catch (error) {
      // Why: a corrupt store only loses per-user git identity; sign-in and pairing keep working.
      console.warn('[github-login] Could not read GitHub user credentials:', error)
    }
  }
}
