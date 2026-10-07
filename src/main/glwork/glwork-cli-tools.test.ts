import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'

type Host = { userData: string; onPath: Set<string>; signedIn: Set<string>; ran: string[] }
const host = vi.hoisted((): Host => ({
  userData: '',
  onPath: new Set(),
  signedIn: new Set(),
  ran: []
}))

vi.mock('electron', () => ({
  app: { getPath: () => host.userData, getAppPath: () => host.userData }
}))
vi.mock('../ipc/agent-detection-shell-path', () => ({
  hydrateShellPathForAgentDetection: async () => {}
}))
vi.mock('../ipc/preflight-command-exec', () => ({
  isCommandOnPath: async (command: string) => host.onPath.has(command),
  execLocalPreflightCommandOrThrow: async (command: string, args: string[]) => {
    host.ran.push([command, ...args].join(' '))
    if (!host.signedIn.has(command)) {
      throw new Error('exit 1')
    }
    return { stdout: '', stderr: '' }
  }
}))

import { readGlWorkCliToolStatuses } from './glwork-cli-tools'
import { applyGlWorkFirstRunSettings } from './glwork-first-run'
import { resetGlWorkBuildForTests } from './glwork-build'

describe('coding tools', () => {
  beforeEach(() => {
    host.onPath = new Set()
    host.signedIn = new Set()
    host.ran = []
  })

  it('reports installed and signed in from the CLIs’ own status commands only', async () => {
    host.onPath = new Set(['claude', 'codex', 'qoder'])
    host.signedIn = new Set(['claude'])
    const tools = await readGlWorkCliToolStatuses()
    expect(tools.map((t) => [t.id, t.installed, t.signedIn])).toEqual([
      ['claude', true, true],
      ['codex', true, false],
      // Qoder has no status command: GL Work does not guess.
      ['qoder', true, null]
    ])
    expect(host.ran).toEqual(['claude auth status', 'codex login status'])
  })

  it('offers the official install command for a CLI that is missing, and runs nothing for it', async () => {
    const tools = await readGlWorkCliToolStatuses()
    expect(tools.every((t) => !t.installed && t.signedIn === false)).toBe(true)
    expect(tools.find((t) => t.id === 'claude')?.installCommand).toBe(
      'curl -fsSL https://claude.ai/install.sh | bash'
    )
    expect(host.ran).toEqual([])
  })
})

describe('GL Work first run', () => {
  let settings: Pick<GlobalSettings, 'agentStatusHooksEnabled' | 'disabledTuiAgents'>
  const store = {
    getSettings: () => settings,
    updateSettings: (updates: typeof settings) => {
      settings = { ...settings, ...updates }
    }
  }

  beforeEach(() => {
    host.userData = mkdtempSync(join(tmpdir(), 'glwork-first-run-'))
    settings = { agentStatusHooksEnabled: true, disabledTuiAgents: [] }
    resetGlWorkBuildForTests()
  })

  afterEach(() => {
    rmSync(host.userData, { recursive: true, force: true })
    vi.unstubAllEnvs()
    resetGlWorkBuildForTests()
  })

  it('turns agent status hooks off and keeps only GL Work’s tools enabled, once', () => {
    vi.stubEnv('GLWORK_BUILD', '1')
    applyGlWorkFirstRunSettings(store)
    expect(settings.agentStatusHooksEnabled).toBe(false)
    expect(settings.disabledTuiAgents).not.toContain('claude')
    expect(settings.disabledTuiAgents).not.toContain('codex')
    expect(settings.disabledTuiAgents).not.toContain('qwen-code')
    expect(settings.disabledTuiAgents).toContain('gemini')
    // The member's later choices stay.
    settings = { agentStatusHooksEnabled: true, disabledTuiAgents: [] }
    applyGlWorkFirstRunSettings(store)
    expect(settings).toEqual({ agentStatusHooksEnabled: true, disabledTuiAgents: [] })
  })

  it('leaves Orca builds alone', () => {
    applyGlWorkFirstRunSettings(store)
    expect(settings).toEqual({ agentStatusHooksEnabled: true, disabledTuiAgents: [] })
  })
})
