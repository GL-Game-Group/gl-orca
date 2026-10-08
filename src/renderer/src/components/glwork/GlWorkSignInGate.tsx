import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import glworkIcon from '../../../../../resources/glwork/icon.png'
import type { GlWorkAccountStatus } from '../../../../shared/glwork-account-types'

// Why: the workspace's title bar is not mounted yet, so this strip lets the member move the window.
const WINDOW_DRAG: React.CSSProperties & { WebkitAppRegion: 'drag' } = { WebkitAppRegion: 'drag' }

/**
 * GL Work opens on the company sign-in until the member signs in (docs/fork/changes/glwork-sign-in-gate.md);
 * signing out or the company revoking the sign-in brings it back. Orca's builds render the app as is.
 * A screen, not a security boundary: what the company controls is checked by the company service.
 */
export function GlWorkSignInGate({ children }: { children: React.ReactNode }): React.ReactNode {
  const api = window.api?.glwork
  const gated = api?.isBuild === true
  const [signedIn, setSignedIn] = useState(api?.signedInAtLoad === true)
  const [status, setStatus] = useState<GlWorkAccountStatus | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) {
      return
    }
    const next = await api.status()
    setStatus(next)
    setSignedIn(next.signedIn)
  }, [api])

  useEffect(() => {
    if (!gated || !api) {
      return
    }
    void refresh()
    return api.onAccountChanged(() => void refresh())
  }, [api, gated, refresh])

  if (!gated || signedIn) {
    return children
  }

  const signIn = (): void => {
    if (!api) {
      return
    }
    setStatus((current) => (current ? { ...current, signingIn: true, error: null } : current))
    void api.signIn().then((next) => {
      setStatus(next)
      setSignedIn(next.signedIn)
    })
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <div className="h-10 shrink-0" style={WINDOW_DRAG} />
      <div className="flex flex-1 items-center justify-center px-6 pb-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
          <img src={glworkIcon} alt="" className="size-20" />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">
              {translate('glwork.gate.title', 'Sign in to GL Work')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {translate(
                'glwork.gate.description',
                'GL Work is the company’s AI workspace. Sign in with your company GitHub account to continue.'
              )}
            </p>
          </div>
          {status?.signingIn ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                {translate(
                  'glwork.gate.waiting',
                  'Finish signing in in your browser, then come back here.'
                )}
              </p>
              <Button type="button" variant="outline" onClick={() => void api?.cancelSignIn()}>
                {translate('glwork.account.cancel', 'Cancel')}
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={signIn} disabled={!status}>
              {translate('glwork.account.signIn', 'Sign in with GitHub')}
            </Button>
          )}
          {status?.error ? <p className="text-xs text-destructive">{status.error}</p> : null}
          {status ? (
            <p className="text-xs text-muted-foreground">
              {translate('glwork.gate.server', 'Company service: {{server}}', {
                server: status.server
              })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
