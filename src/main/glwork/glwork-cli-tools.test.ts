import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
vi.mock('../startup/hydrate-shell-path', () => ({
  hydrateShellPath: async () => {
    host.ran.push('reread PATH')
    return { ok: true, segments: [] }
  },
  mergePathSegments: () => []
}))
vi.mock('../ipc/preflight-command-exec', () => ({
  isCommandOnPath: async (command: string) => host.onPath.has(command),
  execLocalPreflightCommandOrThrow: async (command: string, args: string[]) => {
    host.ran.push([command, ...args].join(' '))
    // Like qodercli 1.1.65: its status exits 0 either way and says which in JSON.
    if (command === 'qodercli') {
      const loggedIn = host.signedIn.has(command)
      return { stdout: JSON.stringify({ logged_in: loggedIn, email: 'x@y.z' }), stderr: '' }
    }
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
    host.onPath = new Set(['claude', 'codex', 'qodercli'])
    host.signedIn = new Set(['claude', 'qodercli'])
    const tools = await readGlWorkCliToolStatuses()
    expect(tools.map((t) => [t.id, t.installed, t.signedIn])).toEqual([
      ['claude', true, true],
      ['codex', true, false],
      ['qoder', true, true]
    ])
    expect(host.ran).toEqual([
      'claude auth status',
      'codex login status',
      'qodercli status -o json'
    ])
    // Only logged_in is taken from Qoder's status; account details never come back.
    expect(JSON.stringify(tools)).not.toContain('x@y.z')
  })

  it('finds Qoder under either name, and re-reads the shell PATH when asked to check again', async () => {
    host.onPath = new Set(['qodercli'])
    const tools = await readGlWorkCliToolStatuses(true)
    expect(tools.find((t) => t.id === 'qoder')).toMatchObject({
      installed: true,
      signedIn: false,
      signInCommand: 'qodercli login',
      // Orca's agent id, so the card's switch-off toggle covers Qoder too.
      agent: 'qoder'
    })
    expect(host.ran).toEqual(['reread PATH', 'qodercli status -o json'])
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
  let settings: Pick<
    GlobalSettings,
    'agentStatusHooksEnabled' | 'disabledTuiAgents' | 'agentDefaultArgs' | 'agentDefaultEnv'
  >
  const orcaDefaults = (): typeof settings => ({
    agentStatusHooksEnabled: true,
    disabledTuiAgents: [],
    agentDefaultArgs: { claude: '--dangerously-skip-permissions', codex: '--model gpt-5' },
    agentDefaultEnv: { goose: { GOOSE_MODE: 'auto' } }
  })
  const store = {
    getSettings: () => settings,
    updateSettings: (updates: Partial<typeof settings>) => {
      settings = { ...settings, ...updates }
    }
  }

  beforeEach(() => {
    host.userData = mkdtempSync(join(tmpdir(), 'glwork-first-run-'))
    settings = orcaDefaults()
    resetGlWorkBuildForTests()
  })

  afterEach(() => {
    rmSync(host.userData, { recursive: true, force: true })
    vi.unstubAllEnvs()
    resetGlWorkBuildForTests()
  })

  it('keeps agent status hooks on and only GL Work’s tools enabled, once', () => {
    vi.stubEnv('GLWORK_BUILD', '1')
    applyGlWorkFirstRunSettings(store)
    expect(settings.agentStatusHooksEnabled).toBe(true)
    expect(settings.disabledTuiAgents).not.toContain('claude')
    expect(settings.disabledTuiAgents).not.toContain('codex')
    expect(settings.disabledTuiAgents).not.toContain('qwen-code')
    expect(settings.disabledTuiAgents).not.toContain('qoder')
    expect(settings.disabledTuiAgents).toContain('gemini')
    // Agents ask first; a member's own extra arguments stay.
    expect(settings.agentDefaultArgs).toMatchObject({ claude: '', codex: '--model gpt-5' })
    expect(settings.agentDefaultEnv).toMatchObject({ goose: {} })
    // The member's later choices stay.
    settings = orcaDefaults()
    applyGlWorkFirstRunSettings(store)
    expect(settings).toEqual(orcaDefaults())
  })

  it('turns the hooks on once for a profile from before, then respects turning them off', () => {
    vi.stubEnv('GLWORK_BUILD', '1')
    writeFileSync(join(host.userData, 'glwork-first-run.json'), '{}')
    settings = { ...orcaDefaults(), agentStatusHooksEnabled: false }
    applyGlWorkFirstRunSettings(store)
    expect(settings.agentStatusHooksEnabled).toBe(true)
    settings = { ...settings, agentStatusHooksEnabled: false }
    applyGlWorkFirstRunSettings(store)
    expect(settings.agentStatusHooksEnabled).toBe(false)
  })

  it('leaves Orca builds alone', () => {
    applyGlWorkFirstRunSettings(store)
    expect(settings).toEqual(orcaDefaults())
  })
})
