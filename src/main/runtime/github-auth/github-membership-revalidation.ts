// Periodically revokes GitHub-bound devices whose owner left the org (or allowed teams).
// Only a definite `not-member` revokes: an unreachable GitHub is not evidence someone left.
import type { DeviceEntry } from '../device-registry'
import type { GithubMembershipVerdict } from './github-device-flow-client'

export const GITHUB_MEMBERSHIP_RECHECK_INTERVAL_MS = 60 * 60 * 1000

export type GithubMembershipRevalidationDeps = {
  listDevices: () => readonly DeviceEntry[]
  checkAccess: (login: string) => Promise<GithubMembershipVerdict>
  revoke: (device: DeviceEntry) => Promise<boolean> | boolean
}

export async function revalidateGithubMemberships(
  deps: GithubMembershipRevalidationDeps
): Promise<{ revokedDeviceIds: string[] }> {
  const verdictByLogin = new Map<string, GithubMembershipVerdict>()
  const revokedDeviceIds: string[] = []
  // Why: safe while revoking — the registry swaps in a new array rather than mutating this one.
  for (const device of deps.listDevices()) {
    const login = device.githubIdentity?.login
    if (!login) {
      continue
    }
    let verdict = verdictByLogin.get(login)
    if (!verdict) {
      verdict = await deps.checkAccess(login)
      verdictByLogin.set(login, verdict)
    }
    if (verdict !== 'not-member') {
      continue
    }
    if (await deps.revoke(device)) {
      console.log(`[github-login] Revoked device ${device.deviceId}: @${login} lost org access`)
      revokedDeviceIds.push(device.deviceId)
    }
  }
  return { revokedDeviceIds }
}

export function startGithubMembershipRevalidation(
  deps: GithubMembershipRevalidationDeps,
  intervalMs: number = GITHUB_MEMBERSHIP_RECHECK_INTERVAL_MS
): () => void {
  let running = false
  const tick = (): void => {
    if (running) {
      return
    }
    running = true
    void revalidateGithubMemberships(deps)
      .catch((error: unknown) => console.warn('[github-login] Membership recheck failed:', error))
      .finally(() => {
        running = false
      })
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  tick()
  return () => clearInterval(timer)
}
