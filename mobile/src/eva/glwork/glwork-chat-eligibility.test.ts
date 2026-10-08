import { describe, expect, it, vi } from 'vitest'
import { resolveMobileNativeChat } from '../../session/mobile-native-chat-eligibility'
import type { AgentStatusEntry } from '../../../../src/shared/agent-status-types'

const glwork = vi.hoisted(() => ({ build: true }))
vi.mock('../../storage/preferences', () => ({ bundledGlWorkBuild: () => glwork.build }))

const status: AgentStatusEntry = {
  state: 'working',
  prompt: '',
  updatedAt: 0,
  stateStartedAt: 0,
  paneKey: 'tab:leaf',
  stateHistory: [],
  agentType: 'claude',
  providerSession: { key: 'session_id', id: 's1' }
}

describe('GL Work: chat only once the desktop reports agent status', () => {
  it('keeps a Claude terminal a terminal while no status has arrived (hooks off)', () => {
    glwork.build = true
    expect(resolveMobileNativeChat({ type: 'terminal', launchAgent: 'claude' })).toBeNull()
  })

  it('offers chat as soon as the status arrives', () => {
    glwork.build = true
    expect(
      resolveMobileNativeChat({ type: 'terminal', launchAgent: 'claude', agentStatus: status })
    ).toMatchObject({
      agent: 'claude',
      sessionId: 's1'
    })
  })

  it("leaves Orca's own build as it was", () => {
    glwork.build = false
    expect(resolveMobileNativeChat({ type: 'terminal', launchAgent: 'claude' })).toMatchObject({
      agent: 'claude',
      sessionId: null
    })
  })
})
