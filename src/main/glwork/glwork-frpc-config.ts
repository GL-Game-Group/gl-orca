/**
 * frpc's side of remote access from the phone (docs/fork/changes/glwork-remote.md): the config
 * GL Work runs frpc with, and what frpc's log says. Ported from agent-work's plugins/tunnel/frpc.js.
 *
 * The device token never lands in the file: frpc renders its config as a template and reads it
 * from the environment GL Work starts frpc with.
 */

/** The environment variable frpc reads the device token from. */
export const GLWORK_FRPC_TOKEN_ENV = 'GLWORK_DEVICE_TOKEN'
/** The header frpc adds to every relayed request; only frpc and this app know its value. */
export const GLWORK_REMOTE_HEADER = 'x-glwork-remote'

export type GlWorkFrpsServer = { addr: string; port: number; protocol: 'wss' | 'tcp' }

export type GlWorkRemoteProxy = {
  /** The company's `remote` tunnel id; frps checks it belongs to this device. */
  id: string
  /** The name frps routes the company's relay on, e.g. r<random hex>.remote.internal. */
  host: string
  /** Orca's runtime WebSocket port on this machine. */
  localPort: number
  secret: string
}

function quote(value: string): string {
  return JSON.stringify(value)
}

export function glworkFrpcConfig(args: {
  server: GlWorkFrpsServer
  member: string
  proxy: GlWorkRemoteProxy
}): string {
  const { server, member, proxy } = args
  return [
    `serverAddr = ${quote(server.addr)}`,
    `serverPort = ${server.port}`,
    `user = ${quote(member)}`,
    // Why: keep retrying; the network comes and goes and the company service may refuse for a while.
    'loginFailExit = false',
    `metadatas.token = "{{ .Envs.${GLWORK_FRPC_TOKEN_ENV} }}"`,
    `transport.protocol = ${quote(server.protocol === 'wss' ? 'wss' : 'tcp')}`,
    // Why: frps calls the company service on each heartbeat; with tcpMux frpc sends none unless told to.
    'transport.heartbeatInterval = 30',
    'transport.heartbeatTimeout = 90',
    'log.to = "console"',
    'log.level = "info"',
    'log.disablePrintColor = true',
    '',
    '[[proxies]]',
    `name = ${quote(proxy.id)}`,
    'type = "http"',
    'localIP = "127.0.0.1"',
    `localPort = ${proxy.localPort}`,
    `customDomains = [${quote(proxy.host)}]`,
    `requestHeaders.set.${GLWORK_REMOTE_HEADER} = ${quote(proxy.secret)}`,
    ''
  ].join('\n')
}

export type GlWorkFrpcState = {
  connection: 'starting' | 'connected' | 'reconnecting' | 'refused'
  /** Why it is not running, as frpc, frps or the company service said. */
  message: string | null
  proxyOk: boolean
}

export function initialGlWorkFrpcState(): GlWorkFrpcState {
  return { connection: 'starting', message: null, proxyOk: false }
}

/** Fold one frpc log line into the state. */
export function readGlWorkFrpcLogLine(state: GlWorkFrpcState, line: string): GlWorkFrpcState {
  let match: RegExpExecArray | null
  if (/login to server success/u.test(line)) {
    return { connection: 'connected', message: null, proxyOk: state.proxyOk }
  }
  if ((match = /login to the server failed: (.*)$/u.exec(line))) {
    return { connection: 'refused', message: match[1]?.trim() ?? null, proxyOk: false }
  }
  if (
    (match =
      /(?:connect to server error|try to reconnect|control writer is closing|work connection closed|reconnect to server)[^:]*:?\s*(.*)$/u.exec(
        line
      ))
  ) {
    return { connection: 'reconnecting', message: match[1]?.trim() || null, proxyOk: false }
  }
  if (/\] start proxy success/u.test(line)) {
    return { ...state, proxyOk: true, message: null }
  }
  if ((match = /\] start error: (.*)$/u.exec(line))) {
    return { ...state, proxyOk: false, message: match[1]?.trim() ?? null }
  }
  return state
}
