import type { GlWorkCliToolId, GlWorkCliToolStatus } from '../../shared/glwork-account-types'
import { hydrateShellPathForAgentDetection } from '../ipc/agent-detection-shell-path'
import { execLocalPreflightCommandOrThrow, isCommandOnPath } from '../ipc/preflight-command-exec'

type CliTool = Omit<GlWorkCliToolStatus, 'installed' | 'signedIn'> & {
  command: string
  /** An official command that exits 0 when signed in and non-zero when not, printing no secret. */
  statusArgs: string[] | null
}

/** The CLIs and their official commands (vendor docs, checked 2026-10). */
export const GLWORK_CLI_TOOLS: readonly CliTool[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    command: 'claude',
    installCommand: 'curl -fsSL https://claude.ai/install.sh | bash',
    signInCommand: 'claude auth login',
    statusArgs: ['auth', 'status'],
    agent: 'claude'
  },
  {
    id: 'codex',
    name: 'Codex',
    command: 'codex',
    installCommand: 'npm install -g @openai/codex',
    signInCommand: 'codex login',
    statusArgs: ['login', 'status'],
    agent: 'codex'
  },
  {
    id: 'qoder',
    name: 'Qoder',
    command: 'qoder',
    installCommand: 'curl -fsSL https://qoder.com/install | bash',
    // Why: Qoder CLI signs in from its own TUI (/login) on first run; it has no status command.
    signInCommand: 'qoder',
    statusArgs: null,
    agent: null
  }
]

async function signedIn(tool: CliTool): Promise<boolean | null> {
  if (!tool.statusArgs) {
    return null
  }
  try {
    await execLocalPreflightCommandOrThrow(tool.command, tool.statusArgs)
    return true
  } catch {
    return false
  }
}

/**
 * Whether each CLI is installed and signed in, from the member's shell PATH. Sign-in is the
 * CLI's own status command's exit code; GL Work never reads the CLIs' credentials.
 */
export async function readGlWorkCliToolStatuses(): Promise<GlWorkCliToolStatus[]> {
  await hydrateShellPathForAgentDetection()
  return Promise.all(
    GLWORK_CLI_TOOLS.map(async (tool) => {
      const installed = await isCommandOnPath(tool.command)
      const { command: _command, statusArgs: _statusArgs, ...shown } = tool
      return { ...shown, installed, signedIn: installed ? await signedIn(tool) : false }
    })
  )
}

export function isGlWorkCliToolId(value: unknown): value is GlWorkCliToolId {
  return GLWORK_CLI_TOOLS.some((tool) => tool.id === value)
}
