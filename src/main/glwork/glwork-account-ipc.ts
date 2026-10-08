import { ipcMain } from 'electron'
import type {
  GlWorkAccountStatus,
  GlWorkModelSources,
  GlWorkModelSourceTool,
  GlWorkModelsResult
} from '../../shared/glwork-account-types'
import { clearGlWorkAccount, readGlWorkAccount, writeGlWorkAccount } from './glwork-account-store'
import { isGlWorkBuild } from './glwork-build'
import {
  CompanySignInExpired,
  fetchCompanyModels,
  glworkServerOrigin,
  revokeDeviceToken
} from './glwork-company-client'
import { startCompanySignIn, type PendingSignIn } from './glwork-sign-in'
import { readGlWorkModelSources, writeGlWorkModelSource } from './glwork-model-sources'
import { readGlWorkCliToolStatuses } from './glwork-cli-tools'
import { reconcileGlWorkRemote, registerGlWorkRemoteIpcHandlers } from './glwork-remote'

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
    void reconcileGlWorkRemote()
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
  // Why first: the device token is about to be revoked, so frpc must not keep the tunnel.
  await reconcileGlWorkRemote()
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

const PROTOCOL_FOR: Record<GlWorkModelSourceTool, 'anthropic' | 'openai'> = {
  claude: 'anthropic',
  qwen: 'openai'
}

/**
 * Point a CLI at a company model (or back at the member's own sign-in with null). The model is
 * looked up in the company's current list, so its gateway address comes from the company service.
 */
async function setModelSource(
  tool: unknown,
  choice: unknown
): Promise<{ ok: true; sources: GlWorkModelSources } | { ok: false; error: string }> {
  if (tool !== 'claude' && tool !== 'qwen') {
    return { ok: false, error: 'Unknown tool.' }
  }
  if (choice === null) {
    return { ok: true, sources: writeGlWorkModelSource(tool, null) }
  }
  const wanted: Record<string, unknown> =
    typeof choice === 'object' && choice !== null ? { ...choice } : {}
  const listed = await models()
  if (!listed.ok) {
    return listed
  }
  const vendor = listed.vendors.find(
    (entry) => entry.vendor === wanted.vendor && entry.protocol === PROTOCOL_FOR[tool]
  )
  const model = vendor?.models.find((entry) => entry.id === wanted.model)
  if (!vendor || !model) {
    return { ok: false, error: 'That company model is not available to you.' }
  }
  return {
    ok: true,
    sources: writeGlWorkModelSource(tool, {
      vendor: vendor.vendor,
      vendorName: vendor.name,
      model: model.id,
      modelName: model.name,
      baseUrl: vendor.baseUrl
    })
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
  ipcMain.handle('glwork:modelSources', () => readGlWorkModelSources())
  ipcMain.handle('glwork:cliTools', (_event, refresh: unknown) =>
    readGlWorkCliToolStatuses(refresh === true)
  )
  ipcMain.handle('glwork:setModelSource', (_event, tool: unknown, choice: unknown) =>
    setModelSource(tool, choice)
  )
  registerGlWorkRemoteIpcHandlers()
}
