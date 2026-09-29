import type { GithubGitIdentityMode } from './github-caller-git-env'
// Env-driven config for GitHub device-flow sign-in that mints pairings for org members.
const ORG_SLUG_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const TEAM_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/
const DEFAULT_OAUTH_SCOPE = 'read:org'
const GIT_IDENTITY_MODES: readonly GithubGitIdentityMode[] = ['off', 'author', 'full']

export type GithubDeviceLoginConfig = {
  clientId: string
  org: string
  /** Empty: every active org member may sign in. */
  allowedTeams: readonly string[]
  /** Empty: every allowed member may mint a full `runtime` (desktop/CLI) pairing. */
  runtimeTeams: readonly string[]
  /** Only classic OAuth Apps read it; GitHub Apps use their installed permissions. */
  scope: string
  /** Org-scoped token for periodic membership rechecks; null disables them. */
  orgToken: string | null
  pairingAddress: string
  /** Rejects devices with no GitHub binding, e.g. QR pairings made before sign-in was enabled. */
  requireIdentity: boolean
  gitIdentityMode: GithubGitIdentityMode
  /** Needed only to refresh expiring GitHub App user tokens. */
  clientSecret: string | null
}

export type GithubDeviceLoginConfigResult =
  | { kind: 'disabled' }
  | { kind: 'invalid'; message: string }
  | { kind: 'enabled'; config: GithubDeviceLoginConfig }

function trimmed(value: string | undefined): string | null {
  const next = value?.trim()
  return next ? next : null
}

function teamList(value: string | undefined): string[] | null {
  const raw = trimmed(value)
  if (!raw) {
    return []
  }
  const teams = [...new Set(raw.split(',').map((team) => team.trim()))].filter(Boolean)
  return teams.every((team) => TEAM_SLUG_PATTERN.test(team)) ? teams : null
}

export function readGithubDeviceLoginConfig(
  env: NodeJS.ProcessEnv,
  servePairingAddress: string | null
): GithubDeviceLoginConfigResult {
  const clientId = trimmed(env.ORCA_GITHUB_LOGIN_CLIENT_ID)
  const org = trimmed(env.ORCA_GITHUB_LOGIN_ORG)
  if (!clientId && !org) {
    return { kind: 'disabled' }
  }
  if (!clientId || !org) {
    return {
      kind: 'invalid',
      message: 'Set both ORCA_GITHUB_LOGIN_CLIENT_ID and ORCA_GITHUB_LOGIN_ORG.'
    }
  }
  if (!ORG_SLUG_PATTERN.test(org)) {
    return { kind: 'invalid', message: `ORCA_GITHUB_LOGIN_ORG is not a GitHub org slug: ${org}` }
  }
  const allowedTeams = teamList(env.ORCA_GITHUB_LOGIN_TEAMS)
  const runtimeTeams = teamList(env.ORCA_GITHUB_LOGIN_RUNTIME_TEAMS)
  if (!allowedTeams || !runtimeTeams) {
    return {
      kind: 'invalid',
      message:
        'ORCA_GITHUB_LOGIN_TEAMS / ORCA_GITHUB_LOGIN_RUNTIME_TEAMS must be comma-separated team slugs.'
    }
  }
  const gitIdentityMode = trimmed(env.ORCA_GITHUB_LOGIN_GIT_IDENTITY) ?? 'author'
  const knownMode = GIT_IDENTITY_MODES.find((mode) => mode === gitIdentityMode)
  if (!knownMode) {
    return {
      kind: 'invalid',
      message: `ORCA_GITHUB_LOGIN_GIT_IDENTITY must be off, author or full: ${gitIdentityMode}`
    }
  }
  const pairingAddress = servePairingAddress ?? trimmed(env.ORCA_GITHUB_LOGIN_PAIRING_ADDRESS)
  if (!pairingAddress) {
    // Why: without an advertised address the minted offer points at loopback, useless off-host.
    return {
      kind: 'invalid',
      message: 'GitHub sign-in needs --pairing-address or ORCA_GITHUB_LOGIN_PAIRING_ADDRESS.'
    }
  }
  return {
    kind: 'enabled',
    config: {
      clientId,
      org,
      allowedTeams,
      runtimeTeams,
      scope: trimmed(env.ORCA_GITHUB_LOGIN_SCOPE) ?? DEFAULT_OAUTH_SCOPE,
      orgToken: trimmed(env.ORCA_GITHUB_LOGIN_ORG_TOKEN),
      pairingAddress,
      requireIdentity: env.ORCA_GITHUB_LOGIN_REQUIRED?.trim() !== '0',
      gitIdentityMode: knownMode,
      clientSecret: trimmed(env.ORCA_GITHUB_LOGIN_CLIENT_SECRET)
    }
  }
}
