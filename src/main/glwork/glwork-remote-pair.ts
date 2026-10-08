import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HttpRequestInterceptor } from '../runtime/rpc/http-request-routing'
import { GLWORK_REMOTE_HEADER } from './glwork-frpc-config'

/** Where the company's relay asks this computer for a pairing (gateway: …/remote/<id>/orca/pair). */
export const GLWORK_REMOTE_PAIR_PATH = '/glwork/remote/pair'
const MAX_BODY_BYTES = 4096
const MAX_DEVICE_NAME = 64

export type GlWorkRemotePairDeps = {
  /** frpc's header value while remote access runs; null otherwise (then nothing is paired). */
  secret: () => string | null
  /** A new mobile device on this computer, as an orca://pair URL for the phone. */
  mint: (deviceName: string) => string | null
}

function writeJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

function sameSecret(presented: string | string[] | undefined, expected: string): boolean {
  if (typeof presented !== 'string') {
    return false
  }
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readDeviceName(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      throw new Error('body_too_large')
    }
    chunks.push(buffer)
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
  const name =
    typeof body === 'object' && body !== null && 'deviceName' in body ? body.deviceName : undefined
  const trimmed = typeof name === 'string' ? name.trim().slice(0, MAX_DEVICE_NAME) : ''
  return trimmed === '' ? 'iPhone' : trimmed
}

/**
 * Pair a phone that reached this computer through the company's relay. frpc sets the secret
 * header on every request it forwards, so a request carrying it came through the company
 * service, which checked the phone belongs to this computer's member. Anything else — a LAN
 * client, a browser page — is refused before the body is read.
 */
export function createGlWorkRemotePairInterceptor(
  deps: GlWorkRemotePairDeps
): HttpRequestInterceptor {
  return (request, response) => {
    if ((request.url ?? '').split('?')[0] !== GLWORK_REMOTE_PAIR_PATH) {
      return false
    }
    const secret = deps.secret()
    if (!secret || !sameSecret(request.headers[GLWORK_REMOTE_HEADER], secret)) {
      writeJson(response, 403, { error: 'forbidden' })
      return true
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      writeJson(response, 405, { error: 'method_not_allowed' })
      return true
    }
    void readDeviceName(request)
      .then((deviceName) => {
        const pairingUrl = deps.mint(deviceName)
        writeJson(
          response,
          pairingUrl ? 200 : 503,
          pairingUrl ? { pairingUrl } : { error: 'pairing_unavailable' }
        )
      })
      .catch((error: unknown) => {
        if (response.headersSent) {
          return
        }
        const tooLarge = error instanceof Error && error.message === 'body_too_large'
        writeJson(response, tooLarge ? 413 : 400, {
          error: tooLarge ? 'body_too_large' : 'invalid_request'
        })
      })
    return true
  }
}
