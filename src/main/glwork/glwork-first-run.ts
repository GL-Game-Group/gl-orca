import { app } from 'electron'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type { TuiAgent } from '../../shared/tui-agent'
import { ALL_TUI_AGENTS } from '../../shared/tui-agent-display-names'
import { applyAgentPermissionMode } from '../../shared/tui-agent-permissions'
import { isGlWorkBuild } from './glwork-build'

/** The coding CLIs GL Work offers; Orca's other agents start out switched off (members may turn them on). */
export const GLWORK_AGENTS: readonly TuiAgent[] = ['claude', 'codex', 'qwen-code', 'qoder']

const MARKER = 'glwork-first-run.json'
/** Agent status hooks turned on once per profile (owner's decision, 2026-10-08); turning them off sticks. */
const HOOKS_MARKER = 'glwork-hooks-default'

type FirstRunSettings = Pick<
  GlobalSettings,
  'agentStatusHooksEnabled' | 'disabledTuiAgents' | 'agentDefaultArgs' | 'agentDefaultEnv'
>

type SettingsStore = {
  getSettings: () => Pick<
    FirstRunSettings,
    'disabledTuiAgents' | 'agentDefaultArgs' | 'agentDefaultEnv'
  >
  updateSettings: (updates: Partial<FirstRunSettings>) => unknown
}

/**
 * eva: GL Work's defaults, once per profile and before Orca installs anything at startup: only GL
 * Work's coding CLIs are enabled, agents ask before they run commands or edit files (Orca starts
 * them skipping every permission prompt), and the agent status hooks are on — the phone's chat view,
 * working status and permission prompts need them. Settings → Coding tools → Agent status turns
 * them off, and that sticks.
 */
export function applyGlWorkFirstRunSettings(store: SettingsStore): void {
  if (!isGlWorkBuild()) {
    return
  }
  applyHooksDefaultOnce(store)
  const marker = join(app.getPath('userData'), MARKER)
  if (existsSync(marker)) {
    return
  }
  const current = store.getSettings()
  const disabled = new Set(current.disabledTuiAgents)
  for (const agent of ALL_TUI_AGENTS) {
    if (!GLWORK_AGENTS.includes(agent)) {
      disabled.add(agent)
    }
  }
  const manual = applyAgentPermissionMode({
    mode: 'manual',
    agentDefaultArgs: current.agentDefaultArgs,
    agentDefaultEnv: current.agentDefaultEnv
  })
  store.updateSettings({
    disabledTuiAgents: [...disabled],
    ...manual
  })
  writeFileSync(marker, `${JSON.stringify({ appliedAt: new Date().toISOString() })}\n`)
}

/** Profiles from before this default had the hooks off without being asked: turn them on once. */
function applyHooksDefaultOnce(store: SettingsStore): void {
  const marker = join(app.getPath('userData'), HOOKS_MARKER)
  if (existsSync(marker)) {
    return
  }
  store.updateSettings({ agentStatusHooksEnabled: true })
  writeFileSync(marker, `${JSON.stringify({ appliedAt: new Date().toISOString() })}\n`)
}
