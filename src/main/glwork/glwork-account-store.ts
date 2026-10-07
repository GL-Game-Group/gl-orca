import { app } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getSecretStore } from '../../shared/secret-store'

/** The member's company sign-in; the device token is the key to the company model gateway. */
export type GlWorkAccount = {
  server: string
  token: string
  member: string
  displayName: string
  expiresAt: number
}

const FILE_NAME = 'glwork-account.enc'

function accountPath(): string {
  return join(app.getPath('userData'), FILE_NAME)
}

function isAccount(value: unknown): value is GlWorkAccount {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const fields: Record<string, unknown> = { ...value }
  return (
    typeof fields.server === 'string' &&
    typeof fields.token === 'string' &&
    typeof fields.member === 'string' &&
    typeof fields.displayName === 'string' &&
    typeof fields.expiresAt === 'number'
  )
}

/** The stored sign-in, or null when there is none, it expired, or it cannot be unsealed. */
export function readGlWorkAccount(now: number = Date.now()): GlWorkAccount | null {
  const store = getSecretStore()
  if (!existsSync(accountPath()) || !store.isEncryptionAvailable()) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(store.decryptString(readFileSync(accountPath())))
    return isAccount(parsed) && parsed.expiresAt > now ? parsed : null
  } catch {
    return null
  }
}

/** Seal the sign-in with the OS keychain-backed store; refuses where nothing can seal it. */
export function writeGlWorkAccount(account: GlWorkAccount): void {
  const store = getSecretStore()
  if (!store.isEncryptionAvailable()) {
    throw new Error('This computer cannot store the company sign-in securely.')
  }
  writeFileSync(accountPath(), store.encryptString(JSON.stringify(account)), { mode: 0o600 })
}

export function clearGlWorkAccount(): void {
  rmSync(accountPath(), { force: true })
}
