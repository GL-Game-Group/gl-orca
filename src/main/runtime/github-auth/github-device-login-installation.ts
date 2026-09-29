// Wires GitHub device-flow sign-in into a runtime RPC server when ORCA_GITHUB_LOGIN_* is set.
import type { OrcaRuntimeRpcServer } from '../runtime-rpc'
import { createGithubBoundPairingOffer } from './github-bound-pairing-offer'
import { readGithubDeviceLoginConfig } from './github-device-login-config'
import { checkGithubAccess, type GithubFetch } from './github-device-flow-client'
import { createGithubLoginRequestInterceptor } from './github-login-http-handler'
import { GithubLoginSessions } from './github-login-sessions'
import { startGithubMembershipRevalidation } from './github-membership-revalidation'
import { installGithubGitIdentity } from './github-git-identity-installation'

export function installGithubDeviceLogin(
  runtimeRpc: OrcaRuntimeRpcServer,
  options: {
    pairingAddress: string | null
    userDataPath: string
    env?: NodeJS.ProcessEnv
    fetchFn?: GithubFetch
  }
): (() => void) | null {
  const result = readGithubDeviceLoginConfig(options.env ?? process.env, options.pairingAddress)
  if (result.kind === 'disabled') {
    return null
  }
  if (result.kind === 'invalid') {
    // Why: fail closed — a half-configured gate must not leave the host open without it.
    throw new Error(`[github-login] ${result.message}`)
  }
  const { config } = result
  const fetchFn = options.fetchFn ?? fetch
  const gitIdentity = installGithubGitIdentity(config, options.userDataPath, fetchFn)
  runtimeRpc.setHttpRequestInterceptor(
    createGithubLoginRequestInterceptor({
      config,
      fetchFn,
      sessions: new GithubLoginSessions(),
      mintOffer: (args) =>
        createGithubBoundPairingOffer(runtimeRpc, { ...args, address: config.pairingAddress }),
      onPaired: gitIdentity.onPaired
    })
  )
  runtimeRpc.setRequireGithubIdentity(config.requireIdentity)

  let stopRevalidation: (() => void) | null = null
  const orgToken = config.orgToken
  if (orgToken) {
    stopRevalidation = startGithubMembershipRevalidation({
      listDevices: () => runtimeRpc.getDeviceRegistry()?.listDevices() ?? [],
      checkAccess: (login) =>
        checkGithubAccess(fetchFn, orgToken, config.org, config.allowedTeams, login),
      revoke: async (device) => {
        const revoked =
          device.scope === 'mobile'
            ? await runtimeRpc.revokeMobileDevice(device.deviceId)
            : runtimeRpc.revokeRuntimeAccess(device.deviceId)
        if (revoked && device.githubIdentity) {
          gitIdentity.forgetUser(device.githubIdentity.userId)
        }
        return revoked
      }
    })
  } else {
    console.warn(
      '[github-login] ORCA_GITHUB_LOGIN_ORG_TOKEN is unset: devices are not revoked when members leave the org.'
    )
  }
  const gateNote = config.requireIdentity ? '; devices without a GitHub identity are rejected' : ''
  console.log(`[github-login] GitHub sign-in enabled for org ${config.org}${gateNote}`)
  return () => {
    stopRevalidation?.()
    gitIdentity.stop()
    runtimeRpc.setHttpRequestInterceptor(null)
    runtimeRpc.setRequireGithubIdentity(false)
  }
}
