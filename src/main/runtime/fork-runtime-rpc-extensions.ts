// The fork's additions to the runtime RPC server (docs/fork/README.md), installed from one line in
// main-process-runtime-launch.ts, which sits at Orca's 300-line limit.
import { installGlWorkRemote } from '../glwork/glwork-remote'
import { getCanonicalUserDataPath } from '../persistence/loading-store/user-data-path'
import { installGithubDeviceLogin } from './github-auth/github-device-login-installation'
import type { OrcaRuntimeRpcServer } from './runtime-rpc'

export function installForkRuntimeRpcExtensions(
  runtimeRpc: OrcaRuntimeRpcServer,
  pairingAddress: string | null
): void {
  installGithubDeviceLogin(runtimeRpc, {
    pairingAddress,
    userDataPath: getCanonicalUserDataPath()
  })
  // Why after: in a GL Work build its relayed-pairing route takes the HTTP hook (GitHub sign-in is unset there).
  installGlWorkRemote(runtimeRpc)
}
