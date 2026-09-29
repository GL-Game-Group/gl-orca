import { useState } from 'react'
import { Github, Loader2 } from 'lucide-react'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { VerifyAndAddRuntimeEnvironmentResult } from '../../../../shared/remote-pairing-verification'
import { useGithubRemoteHostLogin } from './use-github-remote-host-login'

function defaultServerName(server: string): string {
  try {
    return new URL(server.includes('://') ? server : `https://${server}`).hostname
  } catch {
    return server.trim()
  }
}

export function AddRemoteHostGithubLoginPanel({
  onBack,
  onCancel,
  onSaved
}: {
  onBack: () => void
  onCancel: () => void
  onSaved: (result: Extract<VerifyAndAddRuntimeEnvironmentResult, { ok: true }>) => Promise<void>
}): React.JSX.Element {
  const [server, setServer] = useState('')
  const [name, setName] = useState('')
  const [copied, setCopied] = useState(false)
  const { state, start, cancel } = useGithubRemoteHostLogin(onSaved)
  const busy = state.kind !== 'idle'
  const canSubmit = server.trim() !== '' && !busy

  const submit = () => {
    if (!canSubmit) {
      return
    }
    setCopied(false)
    start({ server, name: name.trim() || defaultServerName(server) })
  }

  const openGithub = (userCode: string, verificationUri: string) => {
    void window.api.ui
      .writeClipboardText(userCode)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
      .finally(() => void window.api.shell.openUrl(verificationUri))
  }

  const errorId = 'add-server-github-error'
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {translate(
            'auto.components.sidebar.AddRemoteHostDialog.githubTitle',
            'Sign in with GitHub'
          )}
        </DialogTitle>
        <DialogDescription>
          {translate(
            'auto.components.sidebar.AddRemoteHostDialog.githubDescription',
            'Connect to a team Orca server that lets members of its GitHub organization pair.'
          )}
        </DialogDescription>
      </DialogHeader>

      {state.kind === 'awaiting' ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.githubEnterCode',
              'Enter this code on GitHub to approve this computer:'
            )}
          </p>
          <div className="select-all rounded-md border border-border/60 p-3 text-center font-mono text-2xl font-semibold tracking-widest">
            {state.userCode}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {translate(
              'auto.components.sidebar.AddRemoteHostDialog.githubWaiting',
              'Waiting for authorization on GitHub…'
            )}
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="add-server-github-url">
              {translate('auto.components.sidebar.AddRemoteHostDialog.githubServer', 'Server')}
            </Label>
            <Input
              id="add-server-github-url"
              value={server}
              disabled={busy}
              autoFocus
              aria-invalid={state.kind === 'idle' && state.error !== null}
              aria-describedby={state.kind === 'idle' && state.error ? errorId : undefined}
              onChange={(event) => setServer(event.target.value)}
              placeholder={translate(
                'auto.components.sidebar.AddRemoteHostDialog.githubServerPlaceholder',
                'https://orca.example.com'
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-server-github-name">
              {translate('auto.components.sidebar.AddRemoteHostDialog.serverName', 'Name in Orca')}
            </Label>
            <Input
              id="add-server-github-name"
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                defaultServerName(server) ||
                translate(
                  'auto.components.sidebar.AddRemoteHostDialog.githubNamePlaceholder',
                  'orca.example.com'
                )
              }
            />
          </div>
          {state.kind === 'idle' && state.error ? (
            <p id={errorId} role="alert" className="text-xs text-destructive">
              {state.error}
            </p>
          ) : null}
        </form>
      )}

      <DialogFooter className="sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            cancel()
            onBack()
          }}
        >
          {translate(
            'auto.components.sidebar.AddRemoteHostDialog.githubUseLink',
            'Use an access link instead'
          )}
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              cancel()
              onCancel()
            }}
          >
            {translate('auto.components.sidebar.AddRemoteHostDialog.cancel', 'Cancel')}
          </Button>
          {state.kind === 'awaiting' ? (
            <Button type="button" onClick={() => openGithub(state.userCode, state.verificationUri)}>
              <Github />
              {copied
                ? translate(
                    'auto.components.sidebar.AddRemoteHostDialog.githubCopiedOpen',
                    'Code copied — open GitHub'
                  )
                : translate(
                    'auto.components.sidebar.AddRemoteHostDialog.githubCopyOpen',
                    'Copy code and open GitHub'
                  )}
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {state.kind === 'starting' ? <Loader2 className="animate-spin" /> : <Github />}
              {translate(
                'auto.components.sidebar.AddRemoteHostDialog.githubContinue',
                'Continue with GitHub'
              )}
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}
