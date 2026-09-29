import { hostname } from 'node:os'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { getDefaultUserDataPath, RuntimeClientError } from '../runtime-client'
import type { RuntimeRpcSuccess } from '../runtime-client'
import { redactRuntimeEnvironment } from '../../shared/runtime-environments'
import {
  normalizeGithubLoginServer,
  startGithubLogin,
  waitForGithubLogin,
  type GithubLoginFetch
} from '../../shared/github-device-login-http-client'
import { addEnvironmentFromPairingCode, type EnvironmentAddResult } from '../runtime/environments'

type EnvironmentLoginResult = EnvironmentAddResult & { githubLogin: string }

function requiredString(flags: Map<string, string | boolean>, name: string): string {
  const value = flags.get(name)
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeClientError('invalid_argument', `Missing required --${name}`)
  }
  return value
}

/** Signs in with GitHub on a host that offers it, then saves the minted pairing like `environment add`. */
export function createEnvironmentLoginHandler(
  fetchFn: GithubLoginFetch = (url, init) => fetch(url, init),
  writeProgress: (line: string) => void = (line) => process.stderr.write(`${line}\n`)
): CommandHandler {
  return async ({ flags, json }) => {
    const name = requiredString(flags, 'name')
    const server = normalizeGithubLoginServer(requiredString(flags, 'server'))
    if (!server.ok) {
      throw new RuntimeClientError('invalid_argument', server.message)
    }
    const start = await startGithubLogin(fetchFn, server.origin, {
      client: 'runtime',
      deviceName: hostname().slice(0, 64) || 'Orca CLI'
    })
    if (!start.ok) {
      throw new RuntimeClientError('github_login_failed', start.message)
    }
    // Why: progress goes to stderr so `--json` stdout stays a single parseable result.
    writeProgress(`Open ${start.started.verificationUri} and enter code ${start.started.userCode}`)
    writeProgress('Waiting for authorization on GitHub…')
    const outcome = await waitForGithubLogin(fetchFn, server.origin, start.started)
    if (outcome.kind === 'failed') {
      throw new RuntimeClientError('github_login_failed', outcome.message)
    }
    const environment = redactRuntimeEnvironment(
      addEnvironmentFromPairingCode(getDefaultUserDataPath(), {
        name,
        pairingCode: outcome.pairingUrl
      })
    )
    const success: RuntimeRpcSuccess<EnvironmentLoginResult> = {
      id: 'local',
      ok: true,
      result: { environment, githubLogin: outcome.githubLogin },
      _meta: { runtimeId: 'local' }
    }
    printResult(
      success,
      json,
      (result: EnvironmentLoginResult) =>
        `Signed in as @${result.githubLogin}. Saved environment ${result.environment.name} (${result.environment.id}).`
    )
  }
}
