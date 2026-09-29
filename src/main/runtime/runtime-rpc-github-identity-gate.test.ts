import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeviceRegistry } from './device-registry'
import { OrcaRuntimeService } from './orca-runtime'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

function createServer() {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-github-gate-'))
  const runtime = new OrcaRuntimeService()
  const server = new OrcaRuntimeRpcServer({ runtime, userDataPath, enableWebSocket: false })
  const registry = new DeviceRegistry(userDataPath)
  server['deviceRegistry'] = registry
  return { server, registry }
}

async function statusReply(server: OrcaRuntimeRpcServer, deviceToken: string) {
  const replies: unknown[] = []
  await server['handleWebSocketMessage'](
    JSON.stringify({ id: 'status', method: 'status.get' }),
    (response) => replies.push(JSON.parse(response)),
    () => {},
    undefined,
    undefined,
    deviceToken
  )
  const reply = replies[0]
  const error = reply && typeof reply === 'object' && 'error' in reply ? reply.error : null
  // Why: only the gate's own verdict matters; the stub runtime may fail status.get for other reasons.
  return error && typeof error === 'object' && 'code' in error && error.code === 'forbidden'
    ? 'forbidden'
    : 'admitted'
}

describe('GitHub identity gate', () => {
  it('rejects devices without a GitHub identity only while the gate is on', async () => {
    const { server, registry } = createServer()
    const qrPaired = registry.addDevice('legacy', 'runtime')
    const githubPaired = registry.addGithubBoundDevice('laptop', 'runtime', {
      userId: 1,
      login: 'octocat',
      boundAt: 1
    })

    expect(await statusReply(server, qrPaired.token)).toBe('admitted')

    server.setRequireGithubIdentity(true)
    expect(await statusReply(server, qrPaired.token)).toBe('forbidden')
    expect(await statusReply(server, githubPaired.token)).toBe('admitted')
  })
})
