// Keeps expiring GitHub App user tokens fresh so per-user git and gh keep working past 8 hours.
import { refreshGithubUserToken, type GithubFetch } from './github-device-flow-client'
import type { GithubUserCredentialStore } from './github-user-credential-store'

export const GITHUB_TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000
// Why: longer than the refresh interval, so a token never lapses between two sweeps.
const REFRESH_MARGIN_MS = 30 * 60 * 1000

export async function refreshExpiringGithubTokens(deps: {
  store: GithubUserCredentialStore
  fetchFn: GithubFetch
  clientId: string
  clientSecret: string
  now?: () => number
}): Promise<{ refreshedUserIds: number[] }> {
  const now = (deps.now ?? Date.now)()
  const refreshedUserIds: number[] = []
  for (const credential of deps.store.list()) {
    if (
      !credential.refreshToken ||
      credential.expiresAt === null ||
      credential.expiresAt - now > REFRESH_MARGIN_MS
    ) {
      continue
    }
    try {
      const grant = await refreshGithubUserToken(
        deps.fetchFn,
        deps.clientId,
        deps.clientSecret,
        credential.refreshToken
      )
      deps.store.save(
        { id: credential.userId, login: credential.login, name: credential.name },
        grant
      )
      refreshedUserIds.push(credential.userId)
    } catch (error) {
      // Why: the user can sign in again to mint a new token; one failure must not stop the sweep.
      console.warn(
        `[github-login] Could not refresh the GitHub token for @${credential.login}:`,
        error
      )
    }
  }
  return { refreshedUserIds }
}

export function startGithubTokenRefresh(
  deps: Parameters<typeof refreshExpiringGithubTokens>[0],
  intervalMs: number = GITHUB_TOKEN_REFRESH_INTERVAL_MS
): () => void {
  let running = false
  const tick = (): void => {
    if (running) {
      return
    }
    running = true
    void refreshExpiringGithubTokens(deps).finally(() => {
      running = false
    })
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  tick()
  return () => clearInterval(timer)
}
