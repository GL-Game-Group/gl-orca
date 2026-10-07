import { useAppStore } from '@/store'
import { revealFloatingWorkspacePanel } from '@/lib/floating-workspace-panel-reveal'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../shared/constants'

/**
 * Run a command in a new tab of the floating terminal and show it: install and sign-in steps
 * happen where the member can watch and answer them, with or without a workspace open.
 */
export function runGlWorkCommandInTerminal(id: string, label: string, command: string): void {
  runQuickCommandInNewTab({
    command: { id: `glwork-${id}`, label, command, appendEnter: true },
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID
  })
  revealFloatingWorkspacePanel(useAppStore.getState())
}
