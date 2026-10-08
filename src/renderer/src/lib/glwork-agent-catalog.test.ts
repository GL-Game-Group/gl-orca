import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentCatalogEntry } from './agent-catalog'
import { withoutGlWorkRetiredAgents } from './glwork-agent-catalog'

const entry = (id: AgentCatalogEntry['id']): AgentCatalogEntry => ({
  id,
  label: id,
  cmd: id,
  homepageUrl: 'https://example.com'
})
const entries = [entry('claude'), entry('qoder'), entry('qoder-cn')]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GL Work agent catalog', () => {
  it('drops Qoder in GL Work and keeps Qoder CN', () => {
    vi.stubGlobal('window', { api: { glwork: { isBuild: true } } })
    expect(withoutGlWorkRetiredAgents(entries).map((entry) => entry.id)).toEqual([
      'claude',
      'qoder-cn'
    ])
  })

  it('lists every agent in Orca’s builds', () => {
    vi.stubGlobal('window', { api: {} })
    expect(withoutGlWorkRetiredAgents(entries)).toEqual(entries)
  })
})
