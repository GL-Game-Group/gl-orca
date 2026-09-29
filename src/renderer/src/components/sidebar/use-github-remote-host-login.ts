import { useCallback, useRef, useState } from 'react'
import { isWebClientLocation } from '@/lib/web-client-location'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../../../../shared/remote-pairing-verification'

export type GithubRemoteHostLoginState =
  | { kind: 'idle'; error: string | null }
  | { kind: 'starting' }
  | { kind: 'awaiting'; userCode: string; verificationUri: string }

type SavedEnvironment = Extract<VerifyAndAddRuntimeEnvironmentResult, { ok: true }>

/** Web builds have no main process to run the device flow, so the option is hidden there. */
export function isGithubRemoteHostLoginAvailable(): boolean {
  return !isWebClientLocation()
}

export function useGithubRemoteHostLogin(onSaved: (result: SavedEnvironment) => Promise<void>): {
  state: GithubRemoteHostLoginState
  start: (args: { server: string; name: string }) => void
  cancel: () => void
} {
  const [state, setState] = useState<GithubRemoteHostLoginState>({ kind: 'idle', error: null })
  const loginKeyRef = useRef<string | null>(null)

  const cancel = useCallback(() => {
    const loginKey = loginKeyRef.current
    loginKeyRef.current = null
    if (loginKey) {
      void window.api.runtimeEnvironments.githubLoginCancel({ loginKey })
    }
    setState({ kind: 'idle', error: null })
  }, [])

  const start = useCallback(
    ({ server, name }: { server: string; name: string }) => {
      setState({ kind: 'starting' })
      void (async () => {
        const started = await window.api.runtimeEnvironments.githubLoginStart({ server })
        if (!started.ok) {
          setState({ kind: 'idle', error: started.message })
          return
        }
        loginKeyRef.current = started.loginKey
        setState({
          kind: 'awaiting',
          userCode: started.userCode,
          verificationUri: started.verificationUri
        })
        const result = await window.api.runtimeEnvironments.githubLoginComplete({
          loginKey: started.loginKey,
          name
        })
        // Why: a cancelled or superseded login must not overwrite the form the user went back to.
        if (loginKeyRef.current !== started.loginKey) {
          return
        }
        loginKeyRef.current = null
        if (result.ok) {
          await onSaved(result)
          setState({ kind: 'idle', error: null })
          return
        }
        setState({ kind: 'idle', error: result.message })
      })().catch((error: unknown) => {
        loginKeyRef.current = null
        setState({ kind: 'idle', error: error instanceof Error ? error.message : String(error) })
      })
    },
    [onSaved]
  )

  return { state, start, cancel }
}
