import type { GlWorkCliToolId, GlWorkCliToolStatus } from '../../shared/glwork-account-types'
import { hydrateShellPathForAgentDetection } from '../ipc/agent-detection-shell-path'
import { execLocalPreflightCommandOrThrow, isCommandOnPath } from '../ipc/preflight-command-exec'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'

type CliTool = Omit<GlWorkCliToolStatus, 'installed' | 'signedIn'> & {
  /** Names the CLI is installed under; the first is the one status checks run. */
  commands: readonly string[]
  /** An official command that exits 0 when signed in and non-zero when not, printing no secret. */
  statusArgs: string[] | null
}

/** The CLIs and their official commands (vendor docs, checked 2026-10). */
export const GLWORK_CLI_TOOLS: readonly CliTool[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    commands: ['claude'],
    installCommand: 'curl -fsSL https://claude.ai/install.sh | bash',
    signInCommand: 'claude auth login',
    statusArgs: ['auth', 'status'],
    agent: 'claude'
  },
  {
    id: 'codex',
    name: 'Codex',
    commands: ['codex'],
    installCommand: 'npm install -g @openai/codex',
    signInCommand: 'codex login',
    statusArgs: ['login', 'status'],
    agent: 'codex'
  },
  {
    id: 'qoder',
    name: 'Qoder',
    // Why: its installer puts qodercli in ~/.local/bin and a `qoder` dispatcher in ~/.qoder/entry.
    commands: ['qodercli', 'qoder'],
    installCommand: 'curl -fsSL https://qoder.com/install | bash',
    // Why: Qoder CLI signs in from its own TUI (/login) on first run; it has no status command.
    signInCommand: 'qodercli',
    statusArgs: null,
    agent: null
  }
]

async function signedIn(tool: CliTool): Promise<boolean | null> {
  if (!tool.statusArgs) {
    return null
  }
  try {
    await execLocalPreflightCommandOrThrow(tool.commands[0] ?? '', tool.statusArgs)
    return true
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
      const { commands: _commands, statusArgs: _statusArgs, ...shown } = tool
      return { ...shown, installed, signedIn: installed ? await signedIn(tool) : false }
    })
  )
}

export function isGlWorkCliToolId(value: unknown): value is GlWorkCliToolId {
  return GLWORK_CLI_TOOLS.some((tool) => tool.id === value)
}
