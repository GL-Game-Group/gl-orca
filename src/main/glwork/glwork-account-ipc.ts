import { ipcMain } from 'electron'
import type { GlWorkAccountStatus, GlWorkModelsResult } from '../../shared/glwork-account-types'
import { clearGlWorkAccount, readGlWorkAccount, writeGlWorkAccount } from './glwork-account-store'
import { isGlWorkBuild } from './glwork-build'
import {
  CompanySignInExpired,
  fetchCompanyModels,
  glworkServerOrigin,
  revokeDeviceToken
} from './glwork-company-client'
import { startCompanySignIn, type PendingSignIn } from './glwork-sign-in'

let pending: PendingSignIn | null = null
let lastError: string | null = null

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function status(): GlWorkAccountStatus {
  const account = readGlWorkAccount()
  return {
    isGlWork: isGlWorkBuild(),
    server: account?.server ?? glworkServerOrigin(),
    signedIn: account !== null,
    member: account?.member ?? null,
    displayName: account?.displayName ?? null,
    expiresAt: account?.expiresAt ?? null,
    signingIn: pending !== null,
    error: lastError
  }
}

async function signIn(): Promise<GlWorkAccountStatus> {
  pending?.cancel()
  const server = glworkServerOrigin()
  const attempt = startCompanySignIn(server)
  pending = attempt
  lastError = null
  try {
    const signedIn = await attempt.done
    writeGlWorkAccount({ server, ...signedIn })
  } catch (error) {
    lastError = errorText(error)
  } finally {
    if (pending === attempt) {
      pending = null
    }
  }
  return status()
}

async function signOut(): Promise<GlWorkAccountStatus> {
  const account = readGlWorkAccount()
  clearGlWorkAccount()
  lastError = null
  if (account) {
    await revokeDeviceToken(account.server, account.token)
  }
  return status()
}

async function models(): Promise<GlWorkModelsResult> {
  const account = readGlWorkAccount()
  if (!account) {
    return { ok: false, error: 'Not signed in to the company account.' }
  }
  try {
    return { ok: true, vendors: await fetchCompanyModels(account.server, account.token) }
  } catch (error) {
    if (error instanceof CompanySignInExpired) {
      // Why: a revoked or expired token is useless; ask for a fresh sign-in instead of retrying it.
      clearGlWorkAccount()
      lastError = error.message
    }
    return { ok: false, error: errorText(error) }
  }
}

/** The company account's IPC; registered in every build, inert in Orca's (isGlWork false). */
export function registerGlWorkAccountIpcHandlers(): void {
  // Why sync: the settings navigation is built synchronously and must know which account pane to show.
  ipcMain.on('glwork:isBuildSync', (event) => {
    event.returnValue = isGlWorkBuild()
  })
  ipcMain.handle('glwork:status', () => status())
  ipcMain.handle('glwork:signIn', () => signIn())
  ipcMain.handle('glwork:cancelSignIn', () => {
    pending?.cancel()
    return status()
  })
  ipcMain.handle('glwork:signOut', () => signOut())
  ipcMain.handle('glwork:models', () => models())
}
