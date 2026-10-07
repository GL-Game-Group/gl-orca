import { useAppStore } from '@/store'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/lib/floating-terminal'
import { isFloatingWorkspacePanelVisible } from '@/lib/floating-workspace-terminal-actions'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../../shared/constants'

/**
 * Run a command in a new tab of the floating terminal and show it: install and sign-in steps
 * happen where the member can watch and answer them, with or without a workspace open.
 */
export async function runGlWorkCommandInTerminal(
  id: string,
  label: string,
  command: string
): Promise<void> {
  const store = useAppStore.getState()
  if (store.settings?.floatingTerminalEnabled !== true) {
    await store.updateSettings({ floatingTerminalEnabled: true })
  }
  runQuickCommandInNewTab({
    command: { id: `glwork-${id}`, label, command, appendEnter: true },
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID
  })
  requestAnimationFrame(() => {
    if (!isFloatingWorkspacePanelVisible()) {
      window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))
    }
  })
}
