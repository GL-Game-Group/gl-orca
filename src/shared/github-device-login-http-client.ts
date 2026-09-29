// Client side of GitHub device-flow sign-in, shared by the mobile app and the CLI.
import {
  GITHUB_LOGIN_DEVICE_PATH,
  GITHUB_LOGIN_POLL_PATH,
  githubLoginPollResponseSchema,
  githubLoginStartResponseSchema,
  type GithubLoginPollResponse,
  type GithubLoginStartRequest,
  type GithubLoginStarted
} from './github-device-login-contract'

export type GithubLoginFetch = (url: string, init: RequestInit) => Promise<Response>

export type GithubLoginOutcome =
  | { kind: 'paired'; pairingUrl: string; githubLogin: string }
  | { kind: 'failed'; message: string }

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

/** HTTPS only, because TLS is what authenticates the host whose key the offer carries. */
export function normalizeGithubLoginServer(
  input: string
): { ok: true; origin: string } | { ok: false; message: string } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { ok: false, message: 'Enter the server address.' }
  }
  let url: URL
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return { ok: false, message: 'That is not a valid server address.' }
  }
  const secure =
    url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname))
  if (!secure) {
    return { ok: false, message: 'The server address must use https://.' }
  }
  return { ok: true, origin: url.origin }
}

export function describeGithubLoginFailure(
  response: Exclude<GithubLoginPollResponse, { status: 'pending' } | { status: 'paired' }>
): string {
  switch (response.status) {
    case 'denied':
      return 'Authorization was cancelled on GitHub.'
    case 'expired':
      return 'The sign-in code expired. Start again.'
    case 'forbidden':
      return response.reason === 'runtime_not_allowed'
        ? 'Your GitHub account is not in a team allowed to connect a computer.'
        : 'Your GitHub account is not a member of the organization this server allows.'
    case 'error':
      return describeServerError(response.reason)
  }
}

function describeServerError(reason: string): string {
  switch (reason) {
    case 'rate_limited':
    case 'too_many_pending_logins':
      return 'Too many sign-in attempts. Wait a minute and try again.'
    case 'github_unavailable':
      return 'The server could not reach GitHub. Try again.'
    default:
      return `The server could not complete sign-in (${reason}).`
  }
}

async function postJson(
  fetchFn: GithubLoginFetch,
  origin: string,
  path: string,
  body: unknown,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await fetchFn(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  // Why: the host answers errors as JSON too; a non-JSON body means something else (a proxy page) answered.
  return response.json().catch(() => {
    throw new Error(`Unexpected HTTP ${response.status} response from ${origin}`)
  })
}

export async function startGithubLogin(
  fetchFn: GithubLoginFetch,
  origin: string,
  request: GithubLoginStartRequest,
  signal?: AbortSignal
): Promise<{ ok: true; started: GithubLoginStarted } | { ok: false; message: string }> {
  const parsed = githubLoginStartResponseSchema.safeParse(
    await postJson(fetchFn, origin, GITHUB_LOGIN_DEVICE_PATH, request, signal)
  )
  if (!parsed.success) {
    return { ok: false, message: `${origin} does not offer GitHub sign-in.` }
  }
  if (parsed.data.status === 'error') {
    return { ok: false, message: describeServerError(parsed.data.reason) }
  }
  return { ok: true, started: parsed.data }
}

export type GithubLoginWaitOptions = {
  signal?: AbortSignal
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Polls at the host's interval until the login pairs or ends. Rejects only when aborted or offline. */
export async function waitForGithubLogin(
  fetchFn: GithubLoginFetch,
  origin: string,
  started: GithubLoginStarted,
  options: GithubLoginWaitOptions = {}
): Promise<GithubLoginOutcome> {
  const sleep = options.sleep ?? abortableSleep
  let intervalSeconds = started.interval
  for (;;) {
    await sleep(intervalSeconds * 1000, options.signal)
    const parsed = githubLoginPollResponseSchema.safeParse(
      await postJson(
        fetchFn,
        origin,
        GITHUB_LOGIN_POLL_PATH,
        { loginId: started.loginId },
        options.signal
      )
    )
    if (!parsed.success) {
      return { kind: 'failed', message: `Unexpected sign-in response from ${origin}.` }
    }
    const response = parsed.data
    if (response.status === 'pending') {
      intervalSeconds = response.interval
      continue
    }
    if (response.status === 'paired') {
      return { kind: 'paired', pairingUrl: response.pairingUrl, githubLogin: response.githubLogin }
    }
    return { kind: 'failed', message: describeGithubLoginFailure(response) }
  }
}
