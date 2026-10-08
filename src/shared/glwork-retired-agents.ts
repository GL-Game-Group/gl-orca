import type { TuiAgent } from './tui-agent'

/**
 * Agents GL Work does not offer at all (docs/fork/changes/glwork-cli-tools.md): Qoder, replaced by
 * Qoder CN — the two CLIs can clash, so it stays off (no hooks in ~/.qoder) and out of every list.
 */
export const GLWORK_RETIRED_AGENTS: readonly TuiAgent[] = ['qoder']

export function isGlWorkRetiredAgent(agent: string): boolean {
  return GLWORK_RETIRED_AGENTS.some((retired) => retired === agent)
}
