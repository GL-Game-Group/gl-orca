import { useCallback, useRef, useState } from 'react'
import {
  normalizeGithubLoginServer,
  startGithubLogin,
  waitForGithubLogin
} from '../../../../src/shared/github-device-login-http-client'
import { saveGithubLoginServer } from './github-login-server-preference'

export type GithubDeviceLoginState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'awaiting-authorization'; userCode: string; verificationUri: string }
  | { kind: 'error'; message: string }

export function useGithubDeviceLogin(
  deviceName: string,
  onPaired: (pairingUrl: string) => void
): {
  state: GithubDeviceLoginState
  start: (serverInput: string) => void
  cancel: () => void
  /** Aborts any in-flight login without touching state, for a screen that is going away. */
  dispose: () => void
} {
  const [state, setState] = useState<GithubDeviceLoginState>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const dispose = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const cancel = useCallback(() => {
    dispose()
    setState({ kind: 'idle' })
  }, [dispose])

  const start = useCallback(
    (serverInput: string) => {
      const server = normalizeGithubLoginServer(serverInput)
      if (!server.ok) {
        setState({ kind: 'error', message: server.message })
        return
      }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ kind: 'starting' })
      const fetchFn = (url: string, init: RequestInit) => fetch(url, init)

      void (async () => {
        try {
          const started = await startGithubLogin(
            fetchFn,
            server.origin,
            { client: 'mobile', deviceName },
            controller.signal
          )
          if (!started.ok) {
            setState({ kind: 'error', message: started.message })
            return
          }
          void saveGithubLoginServer(server.origin)
          setState({
            kind: 'awaiting-authorization',
            userCode: started.started.userCode,
            verificationUri: started.started.verificationUri
          })
          const outcome = await waitForGithubLogin(fetchFn, server.origin, started.started, {
            signal: controller.signal
          })
          if (outcome.kind === 'paired') {
            setState({ kind: 'idle' })
            onPaired(outcome.pairingUrl)
            return
          }
          setState({ kind: 'error', message: outcome.message })
        } catch {
          if (!controller.signal.aborted) {
            setState({ kind: 'error', message: `Could not reach ${server.origin}.` })
          }
        }
      })()
    },
    [deviceName, onPaired]
  )

  return { state, start, cancel, dispose }
}
