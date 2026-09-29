// Wires per-user git identity: credential storage, the env source terminals and git read, and refresh.
import { setGithubCallerEnvSource } from './github-caller-git-env'
import type { GithubDeviceLoginConfig } from './github-device-login-config'
import type { GithubFetch, GithubUserTokenGrant } from './github-device-flow-client'
import { GithubUserCredentialStore } from './github-user-credential-store'
import { startGithubTokenRefresh } from './github-user-token-refresh'

export type GithubGitIdentityInstallation = {
  onPaired?: (
    user: { id: number; login: string; name?: string | null },
    grant: GithubUserTokenGrant
  ) => void
  forgetUser: (userId: number) => void
  stop: () => void
}

export function installGithubGitIdentity(
  config: GithubDeviceLoginConfig,
  userDataPath: string,
  fetchFn: GithubFetch
): GithubGitIdentityInstallation {
  if (config.gitIdentityMode === 'off') {
    setGithubCallerEnvSource(null)
    return { forgetUser: () => {}, stop: () => {} }
  }
  // Why: `author` needs no token, so it never writes a credential to disk.
  const store =
    config.gitIdentityMode === 'full' ? new GithubUserCredentialStore(userDataPath) : null
  setGithubCallerEnvSource({
    mode: config.gitIdentityMode,
    credentialFor: (userId) => store?.get(userId) ?? null,
    pathsFor: (userId) => store?.paths(userId) ?? { tokenFile: '', ghConfigDir: '' }
  })
  let stopRefresh = (): void => {}
  if (store && config.clientSecret) {
    stopRefresh = startGithubTokenRefresh({
      store,
      fetchFn,
      clientId: config.clientId,
      clientSecret: config.clientSecret
    })
  } else if (store) {
    console.warn(
      '[github-login] ORCA_GITHUB_LOGIN_CLIENT_SECRET is unset: expiring GitHub App user tokens stop working after 8 hours until the user signs in again.'
    )
  }
  return {
    ...(store ? { onPaired: (user, grant) => void store.save(user, grant) } : {}),
    forgetUser: (userId) => store?.remove(userId),
    stop: () => {
      stopRefresh()
      setGithubCallerEnvSource(null)
    }
  }
}
