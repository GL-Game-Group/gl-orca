import { ipcRenderer } from 'electron'
import type { GlWorkAccountStatus, GlWorkModelsResult } from '../../shared/glwork-account-types'

/** GL Work's company account (src/main/glwork/glwork-account-ipc.ts). */
export type GlWorkApi = {
  /** Whether this app is GL Work rather than Orca; fixed for the process. */
  isBuild: boolean
  status: () => Promise<GlWorkAccountStatus>
  /** Opens the browser for GitHub sign-in and resolves once it comes back, fails or is cancelled. */
  signIn: () => Promise<GlWorkAccountStatus>
  cancelSignIn: () => Promise<GlWorkAccountStatus>
  signOut: () => Promise<GlWorkAccountStatus>
  models: () => Promise<GlWorkModelsResult>
}

function readIsBuild(): boolean {
  try {
    return ipcRenderer.sendSync('glwork:isBuildSync') === true
  } catch {
    return false
  }
}

export const glworkApi: GlWorkApi = {
  isBuild: readIsBuild(),
  status: () => ipcRenderer.invoke('glwork:status'),
  signIn: () => ipcRenderer.invoke('glwork:signIn'),
  cancelSignIn: () => ipcRenderer.invoke('glwork:cancelSignIn'),
  signOut: () => ipcRenderer.invoke('glwork:signOut'),
  models: () => ipcRenderer.invoke('glwork:models')
}
