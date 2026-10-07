import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'

const userData = vi.hoisted(() => ({ path: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => userData.path,
    getAppPath: () => userData.path
  }
}))

import { writeGlWorkAccount } from './glwork-account-store'
import { resetGlWorkBuildForTests } from './glwork-build'
import {
  applyGlWorkCompanyModel,
  companyModelToolFor,
  glworkCompanyModelEnv,
  readGlWorkModelSources,
  writeGlWorkModelSource
} from './glwork-model-sources'

const DEEPSEEK = {
  vendor: 'deepseek',
  vendorName: 'DeepSeek',
  model: 'deepseek-flash',
  modelName: 'DeepSeek Flash',
  baseUrl: 'https://agent.glwork.net/agent-work/llm/deepseek'
}

describe('company model sources', () => {
  beforeEach(() => {
    userData.path = mkdtempSync(join(tmpdir(), 'glwork-sources-'))
    setSecretStore({
      isEncryptionAvailable: () => true,
      encryptString: (text) => Buffer.from(text, 'utf8'),
      decryptString: (cipher) => cipher.toString('utf8'),
      describeProtectionGap: () => null
    })
    vi.stubEnv('GLWORK_BUILD', '1')
    resetGlWorkBuildForTests()
  })

  afterEach(() => {
    rmSync(userData.path, { recursive: true, force: true })
    _resetSecretStoreForTests()
    vi.unstubAllEnvs()
    resetGlWorkBuildForTests()
  })

  it('recognises Claude Code and Qwen Code launches, not other commands', () => {
    expect(companyModelToolFor('claude')).toBe('claude')
    expect(companyModelToolFor('/opt/bin/claude --prefill "hi"')).toBe('claude')
    expect(companyModelToolFor('qwen')).toBe('qwen')
    expect(companyModelToolFor('codex')).toBeNull()
    expect(companyModelToolFor('claude-agent-teams-helper')).toBeNull()
    expect(companyModelToolFor(undefined)).toBeNull()
  })

  it('points Claude Code at the company gateway with the device token, only once chosen and signed in', () => {
    expect(glworkCompanyModelEnv('claude', null)).toEqual({})
    writeGlWorkModelSource('claude', DEEPSEEK)
    expect(glworkCompanyModelEnv('claude', null)).toEqual({})
    writeGlWorkAccount({
      server: 'https://agent.glwork.net',
      token: 'device-token',
      member: 'alice',
      displayName: 'Alice',
      expiresAt: Date.now() + 60_000
    })
    const env = glworkCompanyModelEnv('claude', null)
    expect(env).toMatchObject({
      ANTHROPIC_BASE_URL: DEEPSEEK.baseUrl,
      ANTHROPIC_AUTH_TOKEN: 'device-token',
      ANTHROPIC_MODEL: 'deepseek-flash',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-flash',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1'
    })
    // Remote hosts, other tools and Orca builds get nothing.
    expect(glworkCompanyModelEnv('claude', 'ssh-host-1')).toEqual({})
    expect(glworkCompanyModelEnv('qwen', null)).toEqual({})
    vi.stubEnv('GLWORK_BUILD', '')
    resetGlWorkBuildForTests()
    expect(glworkCompanyModelEnv('claude', null)).toEqual({})
  })

  it('merges the variables into a launch and reports it, so Claude account handling is skipped', () => {
    writeGlWorkAccount({
      server: 'https://agent.glwork.net',
      token: 'device-token',
      member: 'alice',
      displayName: 'Alice',
      expiresAt: Date.now() + 60_000
    })
    writeGlWorkModelSource('claude', DEEPSEEK)
    const launch: { command?: string; connectionId?: string | null; env?: Record<string, string> } =
      {
        command: 'claude',
        env: { TERM: 'xterm-256color' }
      }
    expect(applyGlWorkCompanyModel(launch)).toBe(true)
    expect(launch.env).toMatchObject({
      TERM: 'xterm-256color',
      ANTHROPIC_AUTH_TOKEN: 'device-token'
    })
    const other: { command?: string; env?: Record<string, string> } = { command: 'codex' }
    expect(applyGlWorkCompanyModel(other)).toBe(false)
    expect(other.env).toBeUndefined()
  })

  it('gives Qwen Code the OpenAI-compatible variables, and forgets a source set back to null', () => {
    writeGlWorkAccount({
      server: 'https://agent.glwork.net',
      token: 'device-token',
      member: 'alice',
      displayName: 'Alice',
      expiresAt: Date.now() + 60_000
    })
    writeGlWorkModelSource('qwen', { ...DEEPSEEK, vendor: 'qwen', model: 'qwen3-coder-plus' })
    expect(glworkCompanyModelEnv('qwen', null)).toEqual({
      OPENAI_BASE_URL: DEEPSEEK.baseUrl,
      OPENAI_API_KEY: 'device-token',
      OPENAI_MODEL: 'qwen3-coder-plus'
    })
    writeGlWorkModelSource('qwen', null)
    expect(readGlWorkModelSources()).toEqual({ claude: null, qwen: null })
    expect(glworkCompanyModelEnv('qwen', null)).toEqual({})
  })
})
