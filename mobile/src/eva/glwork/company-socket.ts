// Which WebSocket carries the company sign-in. No native modules here: Orca's transport imports it.

/** The phone's company sign-in: its token reaches only the company service, never a desktop. */
export type CompanySession = {
  server: string
  token: string
  member: string
  displayName: string
  expiresAt: number
}

let session: CompanySession | null = null

export function setCompanySocketSession(next: CompanySession | null): void {
  session = next
}

function sameOrigin(endpoint: URL, server: string): boolean {
  const company = new URL(server)
  const scheme =
    endpoint.protocol === 'wss:' ? 'https:' : endpoint.protocol === 'ws:' ? 'http:' : ''
  return scheme === company.protocol && endpoint.host === company.host
}

/**
 * The WebSocket options for an endpoint: the company sign-in for the company's relay
 * (/agent-work/remote/<id>/orca), nothing for any other host. The relay checks it and drops it
 * before the desktop; Orca's own device token still travels inside the encrypted channel.
 */
export function companySocketOptions(
  endpoint: string
): { headers: Record<string, string> } | undefined {
  if (!session) {
    return undefined
  }
  try {
    const url = new URL(endpoint)
    if (!sameOrigin(url, session.server) || !url.pathname.startsWith('/agent-work/remote/')) {
      return undefined
    }
    return { headers: { Authorization: `Bearer ${session.token}` } }
  } catch {
    return undefined
  }
}

/** React Native's WebSocket takes request headers as a third argument; the DOM typings omit it. */
type ReactNativeWebSocket = new (
  url: string,
  protocols?: string | string[],
  options?: { headers: Record<string, string> }
) => WebSocket

/** Orca's socket, carrying the company sign-in when (and only when) it opens the company's relay. */
export function openWebSocket(endpoint: string): WebSocket {
  const Socket: ReactNativeWebSocket = WebSocket
  return new Socket(endpoint, undefined, companySocketOptions(endpoint))
}
