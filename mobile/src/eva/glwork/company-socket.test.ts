import { afterEach, describe, expect, it } from 'vitest'
import { companySocketOptions, setCompanySocketSession } from './company-socket'

const session = {
  server: 'https://agent.glwork.net',
  token: 'awp_secret',
  member: 'alice',
  displayName: 'Alice',
  expiresAt: Date.now() + 60_000
}

afterEach(() => setCompanySocketSession(null))

describe('companySocketOptions', () => {
  it("signs only the company's relay", () => {
    setCompanySocketSession(session)
    expect(companySocketOptions('wss://agent.glwork.net/agent-work/remote/tun_a/orca')).toEqual({
      headers: { Authorization: 'Bearer awp_secret' }
    })
  })

  it('never hands the token to a desktop, another host, another path or plain ws', () => {
    setCompanySocketSession(session)
    for (const endpoint of [
      'ws://192.168.1.20:6768',
      'wss://agent.glwork.net.evil.com/agent-work/remote/tun_a/orca',
      'wss://evil.com/agent-work/remote/tun_a/orca',
      'wss://agent.glwork.net/other',
      'ws://agent.glwork.net/agent-work/remote/tun_a/orca',
      'not a url'
    ]) {
      expect(companySocketOptions(endpoint), endpoint).toBeUndefined()
    }
  })

  it('sends nothing when signed out', () => {
    expect(
      companySocketOptions('wss://agent.glwork.net/agent-work/remote/tun_a/orca')
    ).toBeUndefined()
  })
})
