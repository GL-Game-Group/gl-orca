import { app } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { TuiAgent } from '../../shared/tui-agent'
import { ALL_TUI_AGENTS } from '../../shared/tui-agent-display-names'
import { isGlWorkBuild } from './glwork-build'

/** The coding CLIs GL Work offers; Orca's other agents start out switched off (members may turn them on). */
export const GLWORK_AGENTS: readonly TuiAgent[] = ['claude', 'codex', 'qwen-code']

const MARKER = 'glwork-first-run.json'

type FirstRunSettings = Pick<GlobalSettings, 'agentStatusHooksEnabled' | 'disabledTuiAgents'>

type SettingsStore = {
  getSettings: () => Pick<FirstRunSettings, 'disabledTuiAgents'>
  updateSettings: (updates: FirstRunSettings) => unknown
}

/**
 * eva: GL Work's defaults, once per profile and before Orca installs anything at startup:
 * agent status hooks stay off until the member agrees (they edit Claude Code's and Codex's
 * own config files), and only GL Work's coding CLIs are enabled.
 */
export function applyGlWorkFirstRunSettings(store: SettingsStore): void {
  const marker = join(app.getPath('userData'), MARKER)
  if (!isGlWorkBuild() || existsSync(marker)) {
    return
  }
  const disabled = new Set(store.getSettings().disabledTuiAgents)
  for (const agent of ALL_TUI_AGENTS) {
    if (!GLWORK_AGENTS.includes(agent)) {
      disabled.add(agent)
    }
  }
  store.updateSettings({ agentStatusHooksEnabled: false, disabledTuiAgents: [...disabled] })
  writeFileSync(marker, `${JSON.stringify({ appliedAt: new Date().toISOString() })}\n`)
}
