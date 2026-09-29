import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DeviceRegistry } from '../device-registry'
import type { GithubMembershipVerdict } from './github-device-flow-client'
import { revalidateGithubMemberships } from './github-membership-revalidation'

function registryWithDevices() {
  const registry = new DeviceRegistry(mkdtempSync(join(tmpdir(), 'orca-github-recheck-')))
  const identity = (login: string, userId: number) => ({ login, userId, boundAt: 1 })
  const alicePhone = registry.addGithubBoundDevice('phone', 'mobile', identity('alice', 1))
  const aliceLaptop = registry.addGithubBoundDevice('laptop', 'runtime', identity('alice', 1))
  const bob = registry.addGithubBoundDevice('phone', 'mobile', identity('bob', 2))
  const qrPaired = registry.addDevice('legacy', 'mobile')
  return { registry, alicePhone, aliceLaptop, bob, qrPaired }
}

describe('revalidateGithubMemberships', () => {
  it('revokes every device of a user who left, checking each login once', async () => {
    const { registry, alicePhone, aliceLaptop, bob, qrPaired } = registryWithDevices()
    const verdicts: Record<string, GithubMembershipVerdict> = { alice: 'not-member', bob: 'member' }
    const checkAccess = vi.fn(async (login: string) => verdicts[login]!)
    const revoke = vi.fn((device: { deviceId: string }) => registry.removeDevice(device.deviceId))

    const result = await revalidateGithubMemberships({
      listDevices: () => registry.listDevices(),
      checkAccess,
      revoke
    })

    expect(result.revokedDeviceIds.sort()).toEqual(
      [alicePhone.deviceId, aliceLaptop.deviceId].sort()
    )
    expect(checkAccess).toHaveBeenCalledTimes(2)
    expect(
      registry
        .listDevices()
        .map((device) => device.deviceId)
        .sort()
    ).toEqual([bob.deviceId, qrPaired.deviceId].sort())
  })

  it('keeps devices when GitHub cannot answer', async () => {
    const { registry } = registryWithDevices()
    const revoke = vi.fn()
    await revalidateGithubMemberships({
      listDevices: () => registry.listDevices(),
      checkAccess: async () => 'unverifiable',
      revoke
    })
    expect(revoke).not.toHaveBeenCalled()
  })

  it('persists the GitHub identity across a registry reload', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-github-identity-'))
    const device = new DeviceRegistry(userDataPath).addGithubBoundDevice('phone', 'mobile', {
      userId: 7,
      login: 'carol',
      boundAt: 3
    })
    expect(new DeviceRegistry(userDataPath).getDevice(device.deviceId)?.githubIdentity).toEqual({
      userId: 7,
      login: 'carol',
      boundAt: 3
    })
  })
})
