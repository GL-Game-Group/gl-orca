import { shell } from 'electron'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { hostname } from 'node:os'
import { exchangeSignInCode, type DeviceSignIn } from './glwork-company-client'

const SIGN_IN_TIMEOUT_MS = 5 * 60_000

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type PendingSignIn = {
  /** Resolves with the device token once the browser comes back; rejects on cancel, timeout or refusal. */
  done: Promise<DeviceSignIn>
  cancel: () => void
}

/**
 * Sign in through the company service like the earlier GL Work did: the browser goes to
 * /agent-work/auth/desktop/start with a PKCE challenge and this computer's loopback port,
 * GitHub signs the member in, and the company sends the browser back here with a one-time code.
 */
export function startCompanySignIn(server: string): PendingSignIn {
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  const state = base64Url(randomBytes(24))
  let settle: { resolve: (signIn: DeviceSignIn) => void; reject: (error: Error) => void } | null =
    null
  const done = new Promise<DeviceSignIn>((resolve, reject) => {
    settle = { resolve, reject }
  })
  let listener: Server | null = null
  const finish = (outcome: DeviceSignIn | Error): void => {
    clearTimeout(timer)
    listener?.close()
    listener = null
    const current = settle
    settle = null
    if (outcome instanceof Error) {
      current?.reject(outcome)
    } else {
      current?.resolve(outcome)
    }
  }
  const timer = setTimeout(
    () => finish(new Error('Sign-in timed out. Try again.')),
    SIGN_IN_TIMEOUT_MS
  )

  listener = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method !== 'GET' || url.pathname !== '/oauth/callback') {
      res.writeHead(404).end()
      return
    }
    const code = url.searchParams.get('code')
    if (!code || !sameText(url.searchParams.get('state') ?? '', state)) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Invalid sign-in.')
      return
    }
    // Why: the company's page says "signed in, back to the app"; this listener has no UI of its own.
    res.writeHead(303, { location: new URL('/agent-work/auth/desktop/done', server).href }).end()
    exchangeSignInCode(server, { code, verifier, deviceName: `GL Work · ${hostname()}` }).then(
      finish,
      (error: unknown) => finish(error instanceof Error ? error : new Error(String(error)))
    )
  })
  listener.on('error', (error) => finish(error))
  listener.listen(0, '127.0.0.1', () => {
    const address = listener?.address()
    if (!address || typeof address === 'string') {
      finish(new Error('Could not open the sign-in callback.'))
      return
    }
    const start = new URL('/agent-work/auth/desktop/start', server)
    start.searchParams.set('port', String(address.port))
    start.searchParams.set('code_challenge', challenge)
    start.searchParams.set('state', state)
    void shell.openExternal(start.href)
  })

  return { done, cancel: () => finish(new Error('Sign-in cancelled.')) }
}
