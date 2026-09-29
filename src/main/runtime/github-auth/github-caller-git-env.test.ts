import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../../shared/child-process/run-process'
import { gitExecFileAsync } from '../../git/command-runner/git-exec-file'
import { runAsGithubCaller } from './github-caller-context'
import {
  githubCallerEnvOverlay,
  setGithubCallerEnvSource,
  withGithubCallerEnv
} from './github-caller-git-env'
import { GithubUserCredentialStore } from './github-user-credential-store'

const octocat = { userId: 42, login: 'octocat', boundAt: 1 }
const noreply = '42+octocat@users.noreply.github.com'

function storeWithOctocat() {
  const store = new GithubUserCredentialStore(mkdtempSync(join(tmpdir(), 'orca-gh-user-')))
  store.save(
    { id: 42, login: 'octocat', name: 'Mona Octocat' },
    {
      accessToken: 'gho_octo',
      refreshToken: null,
      expiresInSeconds: null,
      refreshTokenExpiresInSeconds: null
    }
  )
  return store
}

function installSource(mode: 'author' | 'full', store = storeWithOctocat()) {
  setGithubCallerEnvSource({
    mode,
    credentialFor: (userId) => store.get(userId),
    pathsFor: (userId) => store.paths(userId)
  })
  return store
}

afterEach(() => setGithubCallerEnvSource(null))

/** An env where the host's own git identity is fixed and no user config leaks in. */
function isolatedHostEnv(): { repo: string; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), 'orca-gh-repo-'))
  const emptyConfig = join(root, 'empty.gitconfig')
  writeFileSync(emptyConfig, '')
  const repo = join(root, 'repo')
  mkdirSync(repo)
  return {
    repo,
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Shared Host',
      GIT_AUTHOR_EMAIL: 'host@example.com',
      GIT_COMMITTER_NAME: 'Shared Host',
      GIT_COMMITTER_EMAIL: 'host@example.com'
    }
  }
}

describe('githubCallerEnvOverlay', () => {
  it('changes nothing outside a GitHub-bound request', () => {
    installSource('full')
    const env = { PATH: '/bin' }
    expect(githubCallerEnvOverlay(env)).toBeNull()
    expect(withGithubCallerEnv(env)).toBe(env)
  })

  it('sets only the commit identity in author mode', () => {
    installSource('author')
    const overlay = runAsGithubCaller(octocat, () => githubCallerEnvOverlay({}))
    expect(overlay).toEqual({
      GIT_AUTHOR_NAME: 'Mona Octocat',
      GIT_AUTHOR_EMAIL: noreply,
      GIT_COMMITTER_NAME: 'Mona Octocat',
      GIT_COMMITTER_EMAIL: noreply
    })
  })

  it('falls back to the login when no credential was stored', () => {
    installSource('full', new GithubUserCredentialStore(mkdtempSync(join(tmpdir(), 'orca-gh-'))))
    const overlay = runAsGithubCaller(octocat, () => githubCallerEnvOverlay({}))
    expect(overlay).toEqual(expect.objectContaining({ GIT_AUTHOR_NAME: 'octocat' }))
    expect(overlay).not.toHaveProperty('GH_CONFIG_DIR')
  })

  it('appends credential config after config the environment already carries', () => {
    const store = installSource('full')
    const base = {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.pager',
      GIT_CONFIG_VALUE_0: 'cat'
    }
    const overlay = runAsGithubCaller(octocat, () => githubCallerEnvOverlay(base))
    expect(overlay).toMatchObject({
      GH_CONFIG_DIR: store.paths(42).ghConfigDir,
      ORCA_GITHUB_TOKEN_FILE: store.paths(42).tokenFile,
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
      GIT_CONFIG_VALUE_1: ''
    })
    expect(overlay).not.toHaveProperty('GIT_CONFIG_KEY_0')
  })
})

describe('per-user git identity against real git', () => {
  it('commits as the caller and hands git the caller token for github.com', async () => {
    installSource('full')
    const { repo, env: hostIdentity } = isolatedHostEnv()
    await gitExecFileAsync(['init', '-q'], { cwd: repo, env: hostIdentity })
    writeFileSync(join(repo, 'a.txt'), 'a')
    await gitExecFileAsync(['add', 'a.txt'], { cwd: repo, env: hostIdentity })

    await runAsGithubCaller(octocat, () =>
      gitExecFileAsync(['commit', '-q', '-m', 'by octocat'], { cwd: repo, env: hostIdentity })
    )
    const log = await gitExecFileAsync(['log', '-1', '--format=%an <%ae> / %cn'], {
      cwd: repo,
      env: hostIdentity
    })
    expect(log.stdout.trim()).toBe(`Mona Octocat <${noreply}> / Mona Octocat`)

    const credentialEnv = runAsGithubCaller(octocat, () => withGithubCallerEnv(hostIdentity))
    const fill = await runProcess({
      program: 'git',
      args: ['credential', 'fill'],
      cwd: repo,
      env: { ...credentialEnv, GIT_TERMINAL_PROMPT: '0' },
      input: 'protocol=https\nhost=github.com\n\n'
    })
    expect(fill.stdout).toContain('username=x-access-token')
    expect(fill.stdout).toContain('password=gho_octo')
  })

  it('leaves git calls outside a request on the host identity', async () => {
    installSource('full')
    const { repo, env } = isolatedHostEnv()
    await gitExecFileAsync(['init', '-q'], { cwd: repo, env })
    await gitExecFileAsync(['commit', '-q', '--allow-empty', '-m', 'host'], { cwd: repo, env })
    const log = await gitExecFileAsync(['log', '-1', '--format=%ae'], { cwd: repo, env })
    expect(log.stdout.trim()).toBe('host@example.com')
  })
})
