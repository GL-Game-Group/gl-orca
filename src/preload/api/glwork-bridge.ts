import { ipcRenderer } from 'electron'
import type {
  GlWorkAccountStatus,
  GlWorkCliToolStatus,
  GlWorkModelSources,
  GlWorkModelSourceTool,
  GlWorkModelsResult,
  GlWorkRemoteStatus
} from '../../shared/glwork-account-types'

export type GlWorkModelSourceResult =
  | { ok: true; sources: GlWorkModelSources }
  | { ok: false; error: string }

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
  /** Which company model each CLI runs on (null: the member's own sign-in). */
  modelSources: () => Promise<GlWorkModelSources>
  /** Claude Code, Codex and Qoder: installed, signed in (by their own status commands). */
  cliTools: (refresh?: boolean) => Promise<GlWorkCliToolStatus[]>
  setModelSource: (
    tool: GlWorkModelSourceTool,
    choice: { vendor: string; model: string } | null
  ) => Promise<GlWorkModelSourceResult>
  /** Remote access from the phone through the company's relay (src/main/glwork/glwork-remote.ts). */
  remoteStatus: () => Promise<GlWorkRemoteStatus>
  setRemote: (enabled: boolean) => Promise<GlWorkRemoteStatus>
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
  models: () => ipcRenderer.invoke('glwork:models'),
  modelSources: () => ipcRenderer.invoke('glwork:modelSources'),
  cliTools: (refresh) => ipcRenderer.invoke('glwork:cliTools', refresh === true),
  setModelSource: (tool, choice) => ipcRenderer.invoke('glwork:setModelSource', tool, choice),
  remoteStatus: () => ipcRenderer.invoke('glwork:remoteStatus'),
  setRemote: (enabled) => ipcRenderer.invoke('glwork:setRemote', enabled)
}
