import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GLWORK_REMOTE_PAIR_PATH, createGlWorkRemotePairInterceptor } from './glwork-remote-pair'

let server: Server | null = null

async function serve(
  secret: string | null,
  mint = vi.fn((name: string) => `orca://pair?code=${name}`)
) {
  const intercept = createGlWorkRemotePairInterceptor({ secret: () => secret, mint })
  server = createServer((request, response) => {
    if (!intercept(request, response)) {
      response.statusCode = 404
      response.end()
    }
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port =
    typeof address === 'object' && address !== null ? (address satisfies AddressInfo).port : 0
  const send = async (init: RequestInit & { path?: string }) => {
    const response = await fetch(
      `http://127.0.0.1:${port}${init.path ?? GLWORK_REMOTE_PAIR_PATH}`,
      init
    )
    return { status: response.status, body: await response.json().catch(() => null) }
  }
  return { send, mint }
}

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = null
})

describe('the relayed pairing endpoint', () => {
  it('pairs a phone that came through frpc, naming the device as asked', async () => {
    const { send, mint } = await serve('frpc-secret')
    const reply = await send({
      method: 'POST',
      headers: { 'x-glwork-remote': 'frpc-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ deviceName: '  alice 的 iPhone  ' })
    })
    expect(reply).toEqual({ status: 200, body: { pairingUrl: 'orca://pair?code=alice 的 iPhone' } })
    expect(mint).toHaveBeenCalledTimes(1)
  })

  it("refuses anything without frpc's secret, before reading it", async () => {
    const { send, mint } = await serve('frpc-secret')
    const body = JSON.stringify({ deviceName: 'x' })
    expect((await send({ method: 'POST', body })).status).toBe(403)
    expect(
      (await send({ method: 'POST', body, headers: { 'x-glwork-remote': 'frpc-secreT' } })).status
    ).toBe(403)
    expect(
      (await send({ method: 'POST', body, headers: { 'x-glwork-remote': 'frpc' } })).status
    ).toBe(403)
    expect(mint).not.toHaveBeenCalled()
  })

  it('pairs nothing while remote access is off', async () => {
    const { send, mint } = await serve(null)
    const reply = await send({ method: 'POST', headers: { 'x-glwork-remote': '' }, body: '{}' })
    expect(reply.status).toBe(403)
    expect(mint).not.toHaveBeenCalled()
  })

  it('takes POST only, bounded JSON only, and leaves other paths to Orca', async () => {
    const { send, mint } = await serve('frpc-secret')
    const headers = { 'x-glwork-remote': 'frpc-secret' }
    expect((await send({ method: 'GET', headers })).status).toBe(405)
    expect((await send({ method: 'POST', headers, body: 'not json' })).status).toBe(400)
    expect((await send({ method: 'POST', headers, body: 'x'.repeat(5000) })).status).toBe(413)
    expect(
      (await send({ method: 'POST', headers, body: '{}', path: '/glwork/remote/other' })).status
    ).toBe(404)
    expect(mint).not.toHaveBeenCalled()
    expect((await send({ method: 'POST', headers, body: '' })).body).toEqual({
      pairingUrl: 'orca://pair?code=iPhone'
    })
  })
})
