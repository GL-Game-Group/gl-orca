import { useCallback, useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useGlWorkAgentHooksConsent } from './GlWorkAgentHooksConsent'
import type { GlWorkRemoteStatus } from '../../../../../shared/glwork-account-types'

const POLL_MS = 3_000

function stateLine(status: GlWorkRemoteStatus | null): string {
  switch (status?.state ?? 'off') {
    case 'online':
      return translate(
        'glwork.remote.online',
        'On: your phone can reach this computer while GL Work is open.'
      )
    case 'starting':
      return translate('glwork.remote.starting', 'Connecting to the company service…')
    case 'reconnecting':
      return translate('glwork.remote.reconnecting', 'Reconnecting to the company service…')
    case 'unavailable':
      return translate('glwork.remote.unavailable', 'Not available right now.')
    case 'off':
      return translate(
        'glwork.remote.off',
        'Off. Turn it on to reach this computer from GL Work on your phone, signed in with the same GitHub account.'
      )
  }
}

/** Remote access from the phone through the company's relay (src/main/glwork/glwork-remote.ts). */
export function GlWorkRemoteAccess(): React.JSX.Element | null {
  const api = window.api.glwork
  const confirm = useConfirmationDialog()
  const hooks = useGlWorkAgentHooksConsent()
  const [status, setStatus] = useState<GlWorkRemoteStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (api) {
      setStatus(await api.remoteStatus())
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const settling = status?.enabled === true && status.state !== 'online'
  useEffect(() => {
    if (!settling) {
      return
    }
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [settling, refresh])

  const setEnabled = async (enabled: boolean): Promise<void> => {
    if (!api) {
      return
    }
    if (enabled) {
      const confirmed = await confirm({
        title: translate('glwork.remote.confirmTitle', 'Reach this computer from your phone?'),
        description: translate(
          'glwork.remote.confirmDescription',
          'GL Work will keep a connection to the company service (frpc) while it is open, so GL Work on your phone, signed in with the same GitHub account, can open this computer’s workspaces, terminals and agents. The traffic is end-to-end encrypted; the company service only passes it on. Paired phones are listed under Settings → Mobile, where you can remove them.'
        ),
        confirmLabel: translate('glwork.remote.agree', 'Turn on')
      })
      if (!confirmed) {
        return
      }
    }
    setBusy(true)
    try {
      setStatus(await api.setRemote(enabled))
    } finally {
      setBusy(false)
    }
  }

  if (!api) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Smartphone className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">
          {translate('glwork.remote.title', 'Remote access from your phone')}
        </p>
        <p className="text-xs text-muted-foreground">{stateLine(status)}</p>
        {status?.message ? <p className="text-xs text-destructive">{status.message}</p> : null}
        {status?.enabled && !hooks.enabled ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground">
              {translate(
                'glwork.remote.hooksNeeded',
                'Chat view, working status and permission prompts on your phone need agent status turned on.'
              )}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void hooks.turnOn()}>
              {translate('glwork.hooks.turnOn', 'Turn on…')}
            </Button>
          </div>
        ) : null}
      </div>
      <Switch
        checked={status?.enabled === true}
        disabled={busy || !status}
        onCheckedChange={(checked) => void setEnabled(checked)}
        aria-label={translate('glwork.remote.title', 'Remote access from your phone')}
      />
    </div>
  )
}
