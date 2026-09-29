// Environment that makes git and gh act as the GitHub user behind the current request.
import { appendGitConfigEnv } from '../../../shared/git-credential-prompt-env'
import type { DeviceGithubIdentity } from '../device-github-identity'
import { currentGithubCaller } from './github-caller-context'
import type {
  GithubUserCredential,
  GithubUserCredentialPaths
} from './github-user-credential-store'

/** `author` sets commit identity only; `full` also routes github.com credentials and gh to the user. */
export type GithubGitIdentityMode = 'off' | 'author' | 'full'

export type GithubCallerEnvSource = {
  mode: GithubGitIdentityMode
  credentialFor: (userId: number) => GithubUserCredential | null
  pathsFor: (userId: number) => GithubUserCredentialPaths
}

// Why: reads the token file at use time so a shell spawned hours ago still sends the refreshed token.
const GITHUB_CREDENTIAL_HELPER =
  '!f() { test "$1" = get || exit 0; echo username=x-access-token; printf "password="; cat "$ORCA_GITHUB_TOKEN_FILE"; }; f'

let source: GithubCallerEnvSource | null = null

export function setGithubCallerEnvSource(next: GithubCallerEnvSource | null): void {
  source = next
}

export function githubNoreplyEmail(identity: { userId: number; login: string }): string {
  return `${identity.userId}+${identity.login}@users.noreply.github.com`
}

function identityEnv(identity: DeviceGithubIdentity, credential: GithubUserCredential | null) {
  const name = credential?.name ?? identity.login
  const email = githubNoreplyEmail(identity)
  return {
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email
  }
}

/**
 * The keys to add to `baseEnv` for the current caller, or null outside a GitHub-bound request.
 * Git config goes through GIT_CONFIG_COUNT (git >= 2.31); older git ignores it and keeps the
 * host's credentials, while the author identity variables work on every version.
 */
export function githubCallerEnvOverlay(baseEnv: NodeJS.ProcessEnv): Record<string, string> | null {
  const identity = currentGithubCaller()
  if (!identity || !source || source.mode === 'off') {
    return null
  }
  const credential = source.credentialFor(identity.userId)
  const overlay: Record<string, string> = identityEnv(identity, credential)
  if (source.mode !== 'full' || !credential) {
    return overlay
  }
  const paths = source.pathsFor(identity.userId)
  const merged = {
    ...baseEnv,
    ...overlay,
    GH_CONFIG_DIR: paths.ghConfigDir,
    ORCA_GITHUB_TOKEN_FILE: paths.tokenFile
  }
  // Why: the empty helper resets host-level helpers (e.g. a keychain holding the shared account).
  const withConfig = appendGitConfigEnv(merged, [
    ['credential.https://github.com.helper', ''],
    ['credential.https://github.com.helper', GITHUB_CREDENTIAL_HELPER]
  ])
  for (const [key, value] of Object.entries(withConfig)) {
    if (value !== undefined && baseEnv[key] !== value) {
      overlay[key] = value
    }
  }
  return overlay
}

/** `env` with the caller overlay applied; unchanged outside a GitHub-bound request. */
export function withGithubCallerEnv(
  env: NodeJS.ProcessEnv | undefined
): NodeJS.ProcessEnv | undefined {
  const overlay = githubCallerEnvOverlay(env ?? process.env)
  if (!overlay) {
    return env
  }
  // Why: git runs with exactly this env, so an absent env must still carry the host environment.
  return { ...(env ?? process.env), ...overlay }
}
