import { OrcaRuntimeWithCreateTerminal } from '../orca-runtime-create-terminal'
import { githubCallerEnvOverlay } from './github-caller-git-env'

type CreateTerminalArgs = Parameters<OrcaRuntimeWithCreateTerminal['createTerminal']>

/** Terminals opened for a GitHub-signed-in device commit and push as that user. */
export class OrcaRuntimeWithGithubCallerTerminal extends OrcaRuntimeWithCreateTerminal {
  override async createTerminal(
    worktreeSelector?: CreateTerminalArgs[0],
    opts: CreateTerminalArgs[1] = {},
    created?: CreateTerminalArgs[2]
  ): ReturnType<OrcaRuntimeWithCreateTerminal['createTerminal']> {
    const overlay = githubCallerEnvOverlay({ ...process.env, ...opts.env })
    const withOverlay = overlay ? { ...opts, env: { ...opts.env, ...overlay } } : opts
    return super.createTerminal(worktreeSelector, withOverlay, created)
  }
}
