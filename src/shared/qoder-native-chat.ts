import type { TuiAgent } from './tui-agent'

/**
 * Qoder CLI (and Qoder CN) write Claude Code's transcript format and layout under their own home
 * (`~/.qoder/projects/<slug>/<session>.jsonl`, `~/.qoder-cn/projects/…`), so the chat view reads
 * them with Claude's decoders (docs/fork/changes/glwork-qoder-chat.md).
 */
export const QODER_NATIVE_CHAT_AGENTS = ['qoder', 'qoder-cn'] as const satisfies readonly TuiAgent[]

const QODER_HOME_DIR_NAMES: Record<(typeof QODER_NATIVE_CHAT_AGENTS)[number], string> = {
  qoder: '.qoder',
  'qoder-cn': '.qoder-cn'
}

export function isQoderNativeChatAgent(
  agent: string | null | undefined
): agent is (typeof QODER_NATIVE_CHAT_AGENTS)[number] {
  return agent === 'qoder' || agent === 'qoder-cn'
}

/** The directory under the home that holds this Qoder flavour's `projects/`, or null for other agents. */
export function qoderHomeDirName(agent: string | null | undefined): string | null {
  return isQoderNativeChatAgent(agent) ? QODER_HOME_DIR_NAMES[agent] : null
}
