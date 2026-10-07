import type { GlWorkCliToolId, GlWorkCliToolStatus } from '../../shared/glwork-account-types'
import { hydrateShellPathForAgentDetection } from '../ipc/agent-detection-shell-path'
import { execLocalPreflightCommandOrThrow, isCommandOnPath } from '../ipc/preflight-command-exec'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'

type CliTool = Omit<GlWorkCliToolStatus, 'installed' | 'signedIn'> & {
  /** Names the CLI is installed under; the first is the one status checks run. */
  commands: readonly string[]
  /**
   * An official status command: by exit code (0 signed in), or by the boolean `logged_in` of its
   * JSON output (every other field, account details included, is dropped unread).
   */
  status: { args: string[]; read: 'exit-code' | 'json-logged-in' } | null
}

/** The CLIs and their official commands (vendor docs, checked 2026-10). */
export const GLWORK_CLI_TOOLS: readonly CliTool[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    commands: ['claude'],
    installCommand: 'curl -fsSL https://claude.ai/install.sh | bash',
    signInCommand: 'claude auth login',
    status: { args: ['auth', 'status'], read: 'exit-code' },
    agent: 'claude'
  },
  {
    id: 'codex',
    name: 'Codex',
    commands: ['codex'],
    installCommand: 'npm install -g @openai/codex',
    signInCommand: 'codex login',
    status: { args: ['login', 'status'], read: 'exit-code' },
    agent: 'codex'
  },
  {
    id: 'qoder',
    name: 'Qoder',
    // Why: its installer puts qodercli in ~/.local/bin and a `qoder` dispatcher in ~/.qoder/entry.
    commands: ['qodercli', 'qoder'],
    installCommand: 'curl -fsSL https://qoder.com/install | bash',
    signInCommand: 'qodercli login',
    // Why: `qodercli status` exits 0 signed in or not (1.1.65); its JSON says which.
    status: { args: ['status', '-o', 'json'], read: 'json-logged-in' },
    agent: 'qoder'
  }
]

function jsonSaysLoggedIn(stdout: string): boolean {
  try {
    const parsed: unknown = JSON.parse(stdout)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'logged_in' in parsed &&
      parsed.logged_in === true
    )
  } catch {
    return false
  }
}

async function signedIn(tool: CliTool): Promise<boolean | null> {
  if (!tool.status) {
    return null
  }
  try {
    const { stdout } = await execLocalPreflightCommandOrThrow(
      tool.commands[0] ?? '',
      tool.status.args
    )
    return tool.status.read === 'exit-code' || jsonSaysLoggedIn(stdout)
  } catch {
    return false
  }
}

/**
 * Whether each CLI is installed and signed in, from the member's shell PATH. Sign-in is the
 * CLI's own status command's exit code; GL Work never reads the CLIs' credentials.
 * @param refresh - re-read the login shell's PATH first (an installer just added to it).
 */
export async function readGlWorkCliToolStatuses(refresh = false): Promise<GlWorkCliToolStatus[]> {
  if (refresh) {
    const hydration = await hydrateShellPath({ force: true })
    if (hydration.ok) {
      mergePathSegments(hydration.segments)
    }
  } else {
    await hydrateShellPathForAgentDetection()
  }
  return Promise.all(
    GLWORK_CLI_TOOLS.map(async (tool) => {
      const found = await Promise.all(tool.commands.map((command) => isCommandOnPath(command)))
      const installed = found.some(Boolean)
      const { commands: _commands, status: _status, ...shown } = tool
      return { ...shown, installed, signedIn: installed ? await signedIn(tool) : false }
    })
  )
}

export function isGlWorkCliToolId(value: unknown): value is GlWorkCliToolId {
  return GLWORK_CLI_TOOLS.some((tool) => tool.id === value)
}
