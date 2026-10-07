import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Browser = { opened: string[]; follow: boolean; state: string }
const browser = vi.hoisted((): Browser => ({ opened: [], follow: true, state: '' }))

vi.mock('electron', () => ({
  shell: {
    openExternal: async (url: string) => {
      browser.opened.push(url)
      if (!browser.follow) {
        return
      }
      // The company signs the member in with GitHub, then sends the browser back to the loopback port.
      const start = new URL(url)
      const back = new URL(`http://127.0.0.1:${start.searchParams.get('port')}/oauth/callback`)
      back.searchParams.set('code', 'one-time-code')
      back.searchParams.set('state', browser.state || (start.searchParams.get('state') ?? ''))
      await fetch(back, { redirect: 'manual' })
    }
  }
}))

import { startCompanySignIn } from './glwork-sign-in'
import { fetchCompanyModels, glworkServerOrigin } from './glwork-company-client'

describe('company sign-in', () => {
  let company: Server
  let server = ''
  const exchanged: { code?: string; code_verifier?: string; device_name?: string }[] = []
  let refuse = false

  beforeEach(async () => {
    browser.opened = []
    browser.follow = true
    browser.state = ''
    exchanged.length = 0
    refuse = false
    company = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString()))
      req.on('end', () => {
        if (req.url === '/agent-work/auth/desktop/token') {
          exchanged.push(JSON.parse(body))
          if (refuse) {
            res.writeHead(403).end('{}')
            return
          }
          res.writeHead(200, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              token: 'device-token',
              member: 'alice',
              displayName: '爱丽丝',
              expiresAt: 9e12
            })
          )
          return
        }
        if (req.url === '/agent-work/models') {
          if (req.headers.authorization !== 'Bearer device-token') {
            res.writeHead(401).end('{}')
            return
          }
          res.writeHead(200, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              vendors: [
                {
                  vendor: 'deepseek',
                  name: 'DeepSeek',
                  protocol: 'anthropic',
                  baseUrl: 'https://x/llm/deepseek',
                  models: [{ id: 'deepseek-flash' }]
                },
                { vendor: 'odd', name: 'Odd', protocol: 'grpc', baseUrl: 'https://x', models: [] }
              ]
            })
          )
          return
        }
        res.writeHead(404).end()
      })
    })
    await new Promise<void>((resolve) => company.listen(0, '127.0.0.1', resolve))
    const address = company.address()
    server = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterEach(() => {
    company.close()
  })

  it('opens the company sign-in with PKCE and trades the code for a device token', async () => {
    const signedIn = await startCompanySignIn(server).done
    expect(signedIn).toEqual({
      token: 'device-token',
      member: 'alice',
      displayName: '爱丽丝',
      expiresAt: 9e12
    })
    const start = new URL(browser.opened[0] ?? '')
    expect(start.pathname).toBe('/agent-work/auth/desktop/start')
    expect(start.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [exchange] = exchanged
    expect(exchange?.code).toBe('one-time-code')
    expect(exchange?.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(exchange?.device_name).toMatch(/^GL Work · /)
  })

  it('ignores a callback with the wrong state, and can be cancelled', async () => {
    browser.state = 'forged-state-from-another-tab'
    const attempt = startCompanySignIn(server)
    await vi.waitFor(() => expect(browser.opened).toHaveLength(1))
    attempt.cancel()
    await expect(attempt.done).rejects.toThrow('cancelled')
    expect(exchanged).toHaveLength(0)
  })

  it('reports a GitHub account that is not a company member', async () => {
    refuse = true
    await expect(startCompanySignIn(server).done).rejects.toThrow('not a company member')
  })

  it('lists well-formed company models only, and tells an expired sign-in apart', async () => {
    const vendors = await fetchCompanyModels(server, 'device-token')
    expect(vendors).toEqual([
      {
        vendor: 'deepseek',
        name: 'DeepSeek',
        protocol: 'anthropic',
        baseUrl: 'https://x/llm/deepseek',
        models: [{ id: 'deepseek-flash', name: 'deepseek-flash' }]
      }
    ])
    await expect(fetchCompanyModels(server, 'revoked')).rejects.toThrow('expired or was revoked')
  })
})

describe('company server address', () => {
  it('is the company service unless a local development server is set', () => {
    expect(glworkServerOrigin({})).toBe('https://agent.glwork.net')
    expect(glworkServerOrigin({ GLWORK_SERVER: 'http://127.0.0.1:5173/x' })).toBe(
      'http://127.0.0.1:5173'
    )
    expect(() => glworkServerOrigin({ GLWORK_SERVER: 'http://evil.example' })).toThrow('https')
  })
})
