import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

/**
 * Orca's agent status hooks edit the CLIs' own config files, so GL Work starts with them off
 * (src/main/glwork/glwork-first-run.ts) and turns them on only once the member agrees here.
 */
export function GlWorkAgentHooksConsent(): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const enabled = useAppStore((state) => state.settings?.agentStatusHooksEnabled !== false)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const turnOn = async (): Promise<void> => {
    const confirmed = await confirm({
      title: translate('glwork.hooks.confirmTitle', 'Show agent status in GL Work?'),
      description: translate(
        'glwork.hooks.confirmDescription',
        'GL Work will add its status hooks to the coding tools’ own settings: ~/.claude/settings.json (Claude Code), ~/.codex/config.toml (Codex), ~/.qwen/settings.json (Qwen Code), ~/.qoder/settings.json (Qoder), for the tools you have enabled. They only report working, waiting and done to GL Work. Turning this off later removes them.'
      ),
      confirmLabel: translate('glwork.hooks.agree', 'Agree and turn on')
    })
    if (confirmed) {
      await updateSettings({ agentStatusHooksEnabled: true })
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Activity className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">
          {translate('glwork.hooks.title', 'Agent status in GL Work')}
        </p>
        <p className="text-xs text-muted-foreground">
          {enabled
            ? translate(
                'glwork.hooks.on',
                'On: your enabled coding tools report working, waiting and done through GL Work’s hooks in their settings.'
              )
            : translate(
                'glwork.hooks.off',
                'Off. Turning it on adds hooks to your enabled coding tools’ own settings; GL Work asks first.'
              )}
        </p>
      </div>
      {enabled ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void updateSettings({ agentStatusHooksEnabled: false })}
        >
          {translate('glwork.hooks.turnOff', 'Turn off')}
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={() => void turnOn()}>
          {translate('glwork.hooks.turnOn', 'Turn on…')}
        </Button>
      )}
    </div>
  )
}
