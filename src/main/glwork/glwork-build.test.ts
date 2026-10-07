import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appPath = vi.hoisted(() => ({ value: '' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => appPath.value
  }
}))

import { isGlWorkBuild, resetGlWorkBuildForTests } from './glwork-build'
import { getOrcaCloudAuthConfig } from '../orca-profiles/profile-cloud-auth-config'
import { getDevInstanceIdentity } from '../startup/dev-instance-identity'

function packageWith(manifest: object): void {
  writeFileSync(join(appPath.value, 'package.json'), JSON.stringify(manifest))
  resetGlWorkBuildForTests()
}

describe('GL Work build', () => {
  beforeEach(() => {
    appPath.value = mkdtempSync(join(tmpdir(), 'glwork-build-'))
    packageWith({ name: 'orca' })
  })

  afterEach(() => {
    rmSync(appPath.value, { recursive: true, force: true })
    vi.unstubAllEnvs()
    resetGlWorkBuildForTests()
  })

  it('is Orca unless the package carries the GL Work marker or GLWORK_BUILD=1 is set', () => {
    expect(isGlWorkBuild()).toBe(false)
    packageWith({ name: 'orca', glwork: true })
    expect(isGlWorkBuild()).toBe(true)
    packageWith({ name: 'orca' })
    vi.stubEnv('GLWORK_BUILD', '1')
    expect(isGlWorkBuild()).toBe(true)
  })

  it('names the packaged app GL Work and leaves Orca Cloud sign-in unconfigured', () => {
    expect(getDevInstanceIdentity(false).appName).toBe('Orca')
    expect(getOrcaCloudAuthConfig({}, true).configured).toBe(true)
    packageWith({ name: 'orca', glwork: true })
    expect(getDevInstanceIdentity(false)).toMatchObject({
      name: 'GL Work',
      appName: 'GL Work',
      appUserModelId: 'com.glgwork.work'
    })
    expect(getOrcaCloudAuthConfig({}, true).configured).toBe(false)
  })
})
