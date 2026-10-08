import { app, ipcMain } from 'electron'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAIRING_OFFER_VERSION, encodePairingOffer } from '../../shared/pairing'
import type { GlWorkRemoteStatus } from '../../shared/glwork-account-types'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { readGlWorkAccount } from './glwork-account-store'
import { isGlWorkBuild } from './glwork-build'
import { CompanySignInExpired } from './glwork-company-client'
import { glworkFrpcConfig } from './glwork-frpc-config'
import { GlWorkFrpcProcess } from './glwork-frpc-process'
import { createGlWorkRemotePairInterceptor } from './glwork-remote-pair'
import {
  CompanyRemoteUnavailable,
  companyRelayEndpoint,
  ensureCompanyRemoteTunnel
} from './glwork-remote-company'

const RECONCILE_INTERVAL_MS = 60_000
const PORT_RETRY_MS = 3_000

type RemoteSettings = { enabled: boolean; secret: string }

let runtimeRpc: OrcaRuntimeRpcServer | null = null
let unavailable: string | null = null
let tunnelId: string | null = null
let reconciling: Promise<void> = Promise.resolve()
const frpc = new GlWorkFrpcProcess(() => undefined)

function settingsPath(): string {
  return join(app.getPath('userData'), 'glwork-remote.json')
}

function readSettings(): RemoteSettings {
  try {
    if (existsSync(settingsPath())) {
      const parsed: unknown = JSON.parse(readFileSync(settingsPath(), 'utf8'))
      const fields: Record<string, unknown> =
        typeof parsed === 'object' && parsed !== null ? { ...parsed } : {}
      if (typeof fields.secret === 'string' && fields.secret.length >= 32) {
        return { enabled: fields.enabled === true, secret: fields.secret }
      }
    }
  } catch {
    // A damaged file starts over with the default.
  }
  // Why on: members reach their computers from GL Work on the phone by default; turning it off sticks.
  const created: RemoteSettings = { enabled: true, secret: randomBytes(32).toString('hex') }
  // Why persist now: frpc's header and the pairing check must read the same secret every time.
  try {
    writeSettings(created)
  } catch {
    // Unwritable profile: remote access stays off rather than run with a secret nobody keeps.
    return { ...created, enabled: false }
  }
  return created
}

function writeSettings(settings: RemoteSettings): void {
  // Why 0600: the secret lets the company's relay pair phones with this computer.
  writeFileSync(settingsPath(), JSON.stringify(settings), { mode: 0o600 })
}

function runtimePort(): number | null {
  const endpoint = runtimeRpc?.getWebSocketEndpoint()
  const port = endpoint ? Number(new URL(endpoint).port) : Number.NaN
  return Number.isInteger(port) && port > 0 ? port : null
}

async function reconcileNow(): Promise<void> {
  const settings = readSettings()
  const account = readGlWorkAccount()
  const port = runtimePort()
  if (!settings.enabled || !account) {
    frpc.stop()
    tunnelId = null
    unavailable = null
    return
  }
  if (port === null) {
    // Why: at launch the runtime server starts after this module is installed; look again shortly.
    setTimeout(() => void reconcileGlWorkRemote(), PORT_RETRY_MS).unref()
    return
  }
  try {
    const remote = await ensureCompanyRemoteTunnel(account.server, account.token)
    if (remote.tunnel.closed) {
      throw new CompanyRemoteUnavailable(
        'The administrator closed remote access for this computer.'
      )
    }
    unavailable = null
    tunnelId = remote.tunnel.id
    const config = glworkFrpcConfig({
      server: remote.server,
      member: remote.member,
      proxy: {
        id: remote.tunnel.id,
        host: remote.tunnel.host,
        localPort: port,
        secret: settings.secret
      }
    })
    await frpc.start(config, account.token)
  } catch (error) {
    if (error instanceof CompanyRemoteUnavailable || error instanceof CompanySignInExpired) {
      frpc.stop()
      tunnelId = null
      unavailable = error.message
      return
    }
    // Why: a network blip at the company service leaves a running frpc alone; frps decides.
    unavailable = frpc.runningConfig ? null : error instanceof Error ? error.message : String(error)
  }
}

/** Bring frpc in line with the setting, the sign-in and the company; one pass at a time. */
export function reconcileGlWorkRemote(): Promise<void> {
  reconciling = reconciling.then(reconcileNow, reconcileNow)
  return reconciling
}

export function glworkRemoteStatus(): GlWorkRemoteStatus {
  const enabled = readSettings().enabled
  if (!enabled || !readGlWorkAccount()) {
    return { enabled, state: 'off', message: null }
  }
  if (unavailable) {
    return { enabled, state: 'unavailable', message: unavailable }
  }
  const { connection, proxyOk, message } = frpc.state
  const state = proxyOk ? 'online' : connection === 'starting' ? 'starting' : 'reconnecting'
  return { enabled, state, message }
}

async function setEnabled(enabled: boolean): Promise<GlWorkRemoteStatus> {
  writeSettings({ ...readSettings(), enabled })
  await reconcileGlWorkRemote()
  return glworkRemoteStatus()
}

/** A new mobile device for a phone the company's relay vouched for, pointing back at the relay. */
function mintRelayedPairing(deviceName: string): string | null {
  const account = readGlWorkAccount()
  const registry = runtimeRpc?.getDeviceRegistry()
  const publicKeyB64 = runtimeRpc?.getE2EEPublicKey()
  if (!account || !tunnelId || !registry || !publicKeyB64) {
    return null
  }
  // Why this-computer: the phone arrives through frpc on loopback, so pairing it must not make
  // the next launch publish Orca's port on every network interface.
  const device = registry.addDevice(deviceName, 'mobile', 'this-computer')
  return encodePairingOffer({
    v: PAIRING_OFFER_VERSION,
    endpoint: companyRelayEndpoint(account.server, tunnelId),
    deviceToken: device.token,
    publicKeyB64,
    pairedDeviceId: device.deviceId,
    scope: 'mobile'
  })
}

/** Wire remote access into Orca's runtime server; nothing happens in Orca's own builds. */
export function installGlWorkRemote(server: OrcaRuntimeRpcServer): void {
  if (!isGlWorkBuild()) {
    return
  }
  runtimeRpc = server
  server.setHttpRequestInterceptor(
    createGlWorkRemotePairInterceptor({
      secret: () => (frpc.runningConfig ? readSettings().secret : null),
      mint: mintRelayedPairing
    })
  )
  const timer = setInterval(() => void reconcileGlWorkRemote(), RECONCILE_INTERVAL_MS)
  timer.unref()
  app.on('will-quit', () => {
    clearInterval(timer)
    frpc.stop()
  })
  void reconcileGlWorkRemote()
}

export function registerGlWorkRemoteIpcHandlers(): void {
  ipcMain.handle('glwork:remoteStatus', () => glworkRemoteStatus())
  ipcMain.handle('glwork:setRemote', (_event, enabled: unknown) => setEnabled(enabled === true))
}
