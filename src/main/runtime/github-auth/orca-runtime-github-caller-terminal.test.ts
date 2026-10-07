import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAsGithubCaller } from './github-caller-context'
import { setGithubCallerEnvSource } from './github-caller-git-env'

vi.mock('../orca-runtime-create-terminal', () => ({
  OrcaRuntimeWithCreateTerminal: class {
    async createTerminal(selector?: string, opts?: { env?: Record<string, string> }) {
      return { selector, env: opts?.env }
    }
  }
}))

const { OrcaRuntimeWithGithubCallerTerminal } =
  await import('./orca-runtime-github-caller-terminal')

afterEach(() => setGithubCallerEnvSource(null))

describe('createTerminal for a GitHub-signed-in device', () => {
  it('adds the caller identity and keeps the request env', async () => {
    setGithubCallerEnvSource({
      mode: 'author',
      credentialFor: () => null,
      pathsFor: () => ({ ghConfigDir: '', tokenFile: '' })
    })
    const runtime = new OrcaRuntimeWithGithubCallerTerminal()
    const result = await runAsGithubCaller({ userId: 42, login: 'octocat', boundAt: 1 }, () =>
      runtime.createTerminal('id:w', { env: { FOO: '1' } })
    )
    expect(result).toMatchObject({
      selector: 'id:w',
      env: { FOO: '1', GIT_AUTHOR_EMAIL: '42+octocat@users.noreply.github.com' }
    })
  })

  it('leaves terminals outside a GitHub-bound request unchanged', async () => {
    const runtime = new OrcaRuntimeWithGithubCallerTerminal()
    expect(await runtime.createTerminal('id:w', { env: { FOO: '1' } })).toEqual({
      selector: 'id:w',
      env: { FOO: '1' }
    })
  })
})
