import { describe, expect, it } from 'vitest'
import { readGithubDeviceLoginConfig } from './github-device-login-config'

const base = {
  ORCA_GITHUB_LOGIN_CLIENT_ID: 'Iv1.abc',
  ORCA_GITHUB_LOGIN_ORG: 'acme'
}

describe('readGithubDeviceLoginConfig', () => {
  it('is disabled when neither client id nor org is set', () => {
    expect(readGithubDeviceLoginConfig({}, 'orca.example.com')).toEqual({ kind: 'disabled' })
  })

  it('rejects a half configuration instead of silently disabling the gate', () => {
    const result = readGithubDeviceLoginConfig({ ORCA_GITHUB_LOGIN_ORG: 'acme' }, 'x.example.com')
    expect(result.kind).toBe('invalid')
  })

  it('requires an advertised pairing address', () => {
    expect(readGithubDeviceLoginConfig(base, null).kind).toBe('invalid')
    const fromEnv = readGithubDeviceLoginConfig(
      { ...base, ORCA_GITHUB_LOGIN_PAIRING_ADDRESS: 'wss://orca.example.com' },
      null
    )
    expect(fromEnv).toMatchObject({
      kind: 'enabled',
      config: { pairingAddress: 'wss://orca.example.com' }
    })
  })

  it('prefers the serve --pairing-address over the env fallback', () => {
    const result = readGithubDeviceLoginConfig(
      { ...base, ORCA_GITHUB_LOGIN_PAIRING_ADDRESS: 'wss://env.example.com' },
      'wss://flag.example.com'
    )
    expect(result).toMatchObject({ config: { pairingAddress: 'wss://flag.example.com' } })
  })

  it('parses teams, defaults, and the require-identity opt-out', () => {
    const result = readGithubDeviceLoginConfig(
      {
        ...base,
        ORCA_GITHUB_LOGIN_TEAMS: 'eng, design,eng',
        ORCA_GITHUB_LOGIN_RUNTIME_TEAMS: 'admins',
        ORCA_GITHUB_LOGIN_ORG_TOKEN: ' ghp_x ',
        ORCA_GITHUB_LOGIN_REQUIRED: '0'
      },
      'orca.example.com'
    )
    expect(result).toEqual({
      kind: 'enabled',
      config: {
        clientId: 'Iv1.abc',
        org: 'acme',
        allowedTeams: ['eng', 'design'],
        runtimeTeams: ['admins'],
        scope: 'read:org',
        orgToken: 'ghp_x',
        pairingAddress: 'orca.example.com',
        requireIdentity: false,
        gitIdentityMode: 'author',
        clientSecret: null
      }
    })
  })

  it('reads the git identity mode and rejects unknown ones', () => {
    const full = readGithubDeviceLoginConfig(
      { ...base, ORCA_GITHUB_LOGIN_GIT_IDENTITY: 'full', ORCA_GITHUB_LOGIN_CLIENT_SECRET: 's' },
      'h'
    )
    expect(full).toMatchObject({ config: { gitIdentityMode: 'full', clientSecret: 's' } })
    expect(
      readGithubDeviceLoginConfig({ ...base, ORCA_GITHUB_LOGIN_GIT_IDENTITY: 'push' }, 'h').kind
    ).toBe('invalid')
  })

  it('rejects malformed org and team slugs', () => {
    expect(readGithubDeviceLoginConfig({ ...base, ORCA_GITHUB_LOGIN_ORG: 'a/b' }, 'h').kind).toBe(
      'invalid'
    )
    expect(
      readGithubDeviceLoginConfig({ ...base, ORCA_GITHUB_LOGIN_TEAMS: 'ok,bad team' }, 'h').kind
    ).toBe('invalid')
  })
})
