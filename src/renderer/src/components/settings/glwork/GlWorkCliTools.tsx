import { useCallback, useEffect, useState } from 'react'
import { Check, RefreshCw, TerminalSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { GlWorkCliToolStatus } from '../../../../../shared/glwork-account-types'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import { runGlWorkCommandInTerminal } from './glwork-terminal-command'

const NO_DISABLED_AGENTS: readonly TuiAgent[] = []

function stateLine(tool: GlWorkCliToolStatus): string {
  if (!tool.installed) {
    return translate('glwork.cli.notInstalled', 'Not installed')
  }
  if (tool.signedIn === false) {
    return translate('glwork.cli.notSignedIn', 'Installed, not signed in')
  }
  if (tool.signedIn === null) {
    return translate(
      'glwork.cli.signInUnknown',
      'Installed. It signs in from its own screen on first run.'
    )
  }
  return translate('glwork.cli.signedIn', 'Signed in')
}

/** Claude Code, Codex and Qoder: install and sign in through the vendors' own commands, or switch off. */
export function GlWorkCliTools(): React.JSX.Element | null {
  const api = window.api.glwork
  const confirm = useConfirmationDialog()
  const disabledAgents = useAppStore(
    (state) => state.settings?.disabledTuiAgents ?? NO_DISABLED_AGENTS
  )
  const updateSettings = useAppStore((state) => state.updateSettings)
  const [tools, setTools] = useState<GlWorkCliToolStatus[] | null>(null)
  const [checking, setChecking] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) {
      return
    }
    setChecking(true)
    try {
      setTools(await api.cliTools())
    } finally {
      setChecking(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!api) {
    return null
  }

  const install = async (tool: GlWorkCliToolStatus): Promise<void> => {
    const confirmed = await confirm({
      title: translate('glwork.cli.installTitle', 'Install {{name}}?', { name: tool.name }),
      description: translate(
        'glwork.cli.installDescription',
        'GL Work will run the official install command in a terminal you can watch: {{command}}. It installs into your user folder; nothing else on this computer changes.',
        { command: tool.installCommand }
      ),
      confirmLabel: translate('glwork.cli.install', 'Install')
    })
    if (confirmed) {
      await runGlWorkCommandInTerminal(`install-${tool.id}`, tool.name, tool.installCommand)
    }
  }

  const signIn = (tool: GlWorkCliToolStatus): void => {
    void runGlWorkCommandInTerminal(`sign-in-${tool.id}`, tool.name, tool.signInCommand)
  }

  const setEnabled = (agent: 'claude' | 'codex', enabled: boolean): void => {
    const others = disabledAgents.filter((id) => id !== agent)
    void updateSettings({ disabledTuiAgents: enabled ? others : [...others, agent] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'glwork.cli.description',
            'Each member installs these tools and signs in with their own account; GL Work only checks and helps you start.'
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={checking}
          onClick={() => void refresh()}
        >
          <RefreshCw />
          {translate('glwork.cli.recheck', 'Check again')}
        </Button>
      </div>
      {(tools ?? []).map((tool) => {
        const ready = tool.installed && tool.signedIn !== false
        const enabled = tool.agent ? !disabledAgents.includes(tool.agent) : true
        return (
          <div key={tool.id} className="flex flex-wrap items-center gap-3">
            <TerminalSquare className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{tool.name}</p>
                {ready && tool.signedIn ? (
                  <Badge variant="outline">
                    <Check />
                    {translate('glwork.cli.ready', 'Ready')}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{stateLine(tool)}</p>
            </div>
            {!tool.installed ? (
              <Button type="button" size="sm" onClick={() => void install(tool)}>
                {translate('glwork.cli.install', 'Install')}
              </Button>
            ) : tool.signedIn === false || tool.signedIn === null ? (
              <Button type="button" variant="outline" size="sm" onClick={() => signIn(tool)}>
                {translate('glwork.cli.signIn', 'Sign in')}
              </Button>
            ) : null}
            {tool.installed && tool.agent ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {enabled
                    ? translate('glwork.cli.enabled', 'In use')
                    : translate('glwork.cli.disabled', 'Switched off')}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={(next) => tool.agent && setEnabled(tool.agent, next)}
                  aria-label={translate('glwork.cli.toggle', 'Use {{name}} in new sessions', {
                    name: tool.name
                  })}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
