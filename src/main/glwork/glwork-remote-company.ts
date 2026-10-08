import type { GlWorkFrpsServer } from './glwork-frpc-config'
import { CompanySignInExpired } from './glwork-company-client'

const REQUEST_TIMEOUT_MS = 15_000

/** This computer's remote-access tunnel at the company, and where frpc connects. */
export type GlWorkRemoteTunnel = {
  member: string
  server: GlWorkFrpsServer
  tunnel: { id: string; host: string; closed: boolean; client: string | null }
}

/** Why the company will not run remote access for this computer right now, for the member to read. */
export class CompanyRemoteUnavailable extends Error {}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...value } : {}
}

async function call(server: string, token: string, method: 'GET' | 'POST', body?: unknown) {
  const response = await fetch(new URL('/agent-work/tunnels', server), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (response.status === 401) {
    throw new CompanySignInExpired('The company sign-in expired or was revoked.')
  }
  const answer = record(await response.json().catch(() => null))
  if (!response.ok) {
    const reason = typeof answer.error === 'string' ? answer.error : `${response.status}`
    throw new CompanyRemoteUnavailable(`The company service refused: ${reason}`)
  }
  return answer
}

function readServer(value: unknown): GlWorkFrpsServer | null {
  const fields = record(value)
  return typeof fields.addr === 'string' && typeof fields.port === 'number'
    ? { addr: fields.addr, port: fields.port, protocol: fields.protocol === 'wss' ? 'wss' : 'tcp' }
    : null
}

function ownRemote(answer: Record<string, unknown>): GlWorkRemoteTunnel['tunnel'] | null {
  const tunnels = Array.isArray(answer.tunnels) ? answer.tunnels : []
  for (const entry of tunnels) {
    const tunnel = record(entry)
    if (
      tunnel.type === 'remote' &&
      tunnel.device === answer.device &&
      typeof tunnel.id === 'string' &&
      typeof tunnel.host === 'string'
    ) {
      return {
        id: tunnel.id,
        host: tunnel.host,
        closed: tunnel.closedBy !== null,
        client: typeof tunnel.client === 'string' ? tunnel.client : null
      }
    }
  }
  return null
}

/**
 * This computer's remote tunnel (GET /agent-work/tunnels), registered first when it has none
 * (POST, one per device, so asking again returns the same one).
 */
export async function ensureCompanyRemoteTunnel(
  server: string,
  token: string
): Promise<GlWorkRemoteTunnel> {
  let answer = await call(server, token, 'GET')
  const settings = record(answer.settings)
  const frps = readServer(answer.server)
  if (!frps || settings.enabled !== true) {
    throw new CompanyRemoteUnavailable('The company service runs no tunnel server.')
  }
  if (settings.remote === false) {
    throw new CompanyRemoteUnavailable('The administrator has turned remote access off.')
  }
  // Why client: the phone speaks Orca's protocol only to computers registered as GL Work on Orca;
  // a device that ran the DSH desktop before gets its existing tunnel re-marked.
  if (ownRemote(answer)?.client !== 'orca') {
    await call(server, token, 'POST', { type: 'remote', client: 'orca' })
    answer = await call(server, token, 'GET')
  }
  const tunnel = ownRemote(answer)
  if (!tunnel || typeof answer.member !== 'string') {
    throw new CompanyRemoteUnavailable('The company service did not register this computer.')
  }
  return { member: answer.member, server: frps, tunnel }
}

/** Where the phone reaches this computer: the company's relay for its tunnel. */
export function companyRelayEndpoint(server: string, tunnelId: string): string {
  const url = new URL(`/agent-work/remote/${tunnelId}/orca`, server)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
