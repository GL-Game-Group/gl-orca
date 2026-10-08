import type { TuiAgent } from './tui-agent'

/**
 * Qoder CN writes Claude Code's transcript format and layout under its own home
 * (`~/.qoder-cn/projects/<slug>/<session>.jsonl`), so the chat view reads it with Claude's decoders
 * (docs/fork/changes/glwork-qoder-chat.md). Only Qoder CN: GL Work does not offer Qoder.
 */
export const QODER_NATIVE_CHAT_AGENTS = ['qoder-cn'] as const satisfies readonly TuiAgent[]

export function isQoderNativeChatAgent(agent: string | null | undefined): agent is 'qoder-cn' {
  return agent === 'qoder-cn'
}

/** The directory under the home that holds Qoder CN's `projects/`, or null for other agents. */
export function qoderHomeDirName(agent: string | null | undefined): string | null {
  return isQoderNativeChatAgent(agent) ? '.qoder-cn' : null
}
