import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentType } from '../../shared/native-chat-types'
import { qoderHomeDirName } from '../../shared/qoder-native-chat'
import type { ResolveSessionFileOptions } from './session-file-resolver'

/**
 * Qoder reads as Claude, but its id fallback must search Qoder's own `projects/`, never
 * `~/.claude/projects` (docs/fork/changes/glwork-qoder-chat.md). Resolved per call, like Claude's roots.
 */
export function withQoderProjectsDir(
  agent: AgentType,
  options: ResolveSessionFileOptions
): ResolveSessionFileOptions {
  const dirName = qoderHomeDirName(agent)
  if (!dirName || options.claudeProjectsDir) {
    return options
  }
  return { ...options, claudeProjectsDir: join(homedir(), dirName, 'projects') }
}
