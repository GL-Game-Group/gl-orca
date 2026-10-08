import { describe, expect, it } from 'vitest'
import {
  GLWORK_FRPC_TOKEN_ENV,
  glworkFrpcConfig,
  initialGlWorkFrpcState,
  readGlWorkFrpcLogLine
} from './glwork-frpc-config'

describe('glworkFrpcConfig', () => {
  const config = glworkFrpcConfig({
    server: { addr: 'frp.glwork.net', port: 443, protocol: 'wss' },
    member: 'alice',
    proxy: { id: 'tun_abc', host: 'r0123.remote.internal', localPort: 6768, secret: 's"e\\c' }
  })

  it("publishes only Orca's runtime port, under the company's name, with the secret header", () => {
    expect(config).toContain('serverAddr = "frp.glwork.net"')
    expect(config).toContain('user = "alice"')
    expect(config).toContain('transport.protocol = "wss"')
    expect(config).toContain('transport.heartbeatInterval = 30')
    expect(config).toContain('localIP = "127.0.0.1"')
    expect(config).toContain('localPort = 6768')
    expect(config).toContain('customDomains = ["r0123.remote.internal"]')
    expect(config).toContain('requestHeaders.set.x-glwork-remote = "s\\"e\\\\c"')
    expect(config.match(/\[\[proxies\]\]/gu)).toHaveLength(1)
  })

  it('reads the device token from the environment, never the file', () => {
    expect(config).toContain(`metadatas.token = "{{ .Envs.${GLWORK_FRPC_TOKEN_ENV} }}"`)
  })
})

describe('readGlWorkFrpcLogLine', () => {
  it('follows login, the proxy, refusals and reconnects', () => {
    let state = initialGlWorkFrpcState()
    state = readGlWorkFrpcLogLine(
      state,
      '2026-10-08 [I] [client/service.go:1] login to server success, get run id [x]'
    )
    expect(state.connection).toBe('connected')
    state = readGlWorkFrpcLogLine(
      state,
      '[I] [proxy/proxy_manager.go:1] [alice.tun_abc] start proxy success'
    )
    expect(state.proxyOk).toBe(true)
    state = readGlWorkFrpcLogLine(state, '[W] [client/control.go:1] try to reconnect to server...')
    expect(state).toMatchObject({ connection: 'reconnecting', proxyOk: false })
    state = readGlWorkFrpcLogLine(state, '[W] login to the server failed: GL Work 的登录已失效')
    expect(state).toEqual({
      connection: 'refused',
      message: 'GL Work 的登录已失效',
      proxyOk: false
    })
    state = readGlWorkFrpcLogLine(state, '[W] [alice.tun_abc] start error: 管理员已关闭这条隧道')
    expect(state).toMatchObject({ proxyOk: false, message: '管理员已关闭这条隧道' })
  })
})
