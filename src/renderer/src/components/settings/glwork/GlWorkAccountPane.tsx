import { useCallback, useEffect, useState } from 'react'
import { Check, CircleUserRound, Cpu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type {
  GlWorkAccountStatus,
  GlWorkModelsResult
} from '../../../../../shared/glwork-account-types'

function statusLine(status: GlWorkAccountStatus | null): string {
  if (!status) {
    return translate('glwork.account.checking', 'Checking the company sign-in…')
  }
  if (status.signingIn) {
    return translate(
      'glwork.account.waiting',
      'Finish signing in with GitHub in your browser, then come back here.'
    )
  }
  if (status.signedIn) {
    return translate('glwork.account.signedInAs', 'Signed in as {{member}} at {{server}}', {
      member: status.member ?? '',
      server: new URL(status.server).host
    })
  }
  return translate(
    'glwork.account.signedOut',
    'Sign in with your GitHub account to use the company models and reach this computer from GL Work on your phone.'
  )
}

function CompanyModels({ result }: { result: GlWorkModelsResult | null }): React.JSX.Element {
  if (!result) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate('glwork.account.modelsLoading', 'Loading the company models…')}
      </p>
    )
  }
  if (!result.ok) {
    return <p className="text-xs text-destructive">{result.error}</p>
  }
  if (result.vendors.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {translate(
          'glwork.account.modelsNone',
          'No company models are assigned to you yet. Ask an administrator.'
        )}
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {result.vendors.map((vendor) => (
        <div key={vendor.vendor} className="flex items-start gap-3">
          <Cpu className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">
              {vendor.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {vendor.protocol === 'anthropic'
                  ? translate('glwork.account.protocolAnthropic', 'for Claude Code')
                  : translate('glwork.account.protocolOpenai', 'for Qwen Code')}
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {vendor.models.map((model) => (
                <Badge key={model.id} variant="outline">
                  {model.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function GlWorkAccountPane(): React.JSX.Element {
  const api = window.api.glwork
  const [status, setStatus] = useState<GlWorkAccountStatus | null>(null)
  const [models, setModels] = useState<GlWorkModelsResult | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) {
      return
    }
    const next = await api.status()
    setStatus(next)
    if (next.signedIn) {
      const listed = await api.models()
      setModels(listed)
      if (!listed.ok) {
        setStatus(await api.status())
      }
    } else {
      setModels(null)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = async (action: () => Promise<GlWorkAccountStatus>): Promise<void> => {
    setBusy(true)
    try {
      setStatus(await action())
    } finally {
      setBusy(false)
    }
    await refresh()
  }

  const signIn = (): void => {
    if (!api) {
      return
    }
    setStatus((current) => (current ? { ...current, signingIn: true, error: null } : current))
    void run(api.signIn)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CircleUserRound className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {status?.displayName?.trim() || translate('glwork.account.title', 'Company account')}
            </p>
            {status?.signedIn ? (
              <Badge variant="outline">
                <Check />
                {translate('glwork.account.connected', 'Signed in')}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{statusLine(status)}</p>
          {status?.error ? <p className="text-xs text-destructive">{status.error}</p> : null}
        </div>
        {status?.signingIn ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => api && void run(api.cancelSignIn)}
          >
            {translate('glwork.account.cancel', 'Cancel')}
          </Button>
        ) : status?.signedIn ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => api && void run(api.signOut)}
          >
            {translate('glwork.account.signOut', 'Sign out')}
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy || !status} onClick={signIn}>
            {translate('glwork.account.signIn', 'Sign in with GitHub')}
          </Button>
        )}
      </div>

      {status?.signedIn ? (
        <div className="space-y-4 border-t border-border/60 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            {translate('glwork.account.modelsTitle', 'Company models')}
          </p>
          <CompanyModels result={models} />
        </div>
      ) : null}
    </div>
  )
}
