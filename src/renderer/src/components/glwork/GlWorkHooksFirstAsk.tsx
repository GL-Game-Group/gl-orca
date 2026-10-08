import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

/**
 * Asks once, right after the member is signed in, whether to turn the agent status hooks on: they
 * edit the coding tools' own settings, so GL Work leaves them off until the member says yes. Either
 * answer is final for the prompt; Settings → Coding tools → Agent status changes it any time.
 */
export function GlWorkHooksFirstAsk(): React.JSX.Element | null {
  const api = window.api?.glwork
  const hooksOff = useAppStore((state) => state.settings?.agentStatusHooksEnabled === false)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!api?.isBuild || !hooksOff) {
      return
    }
    let cancelled = false
    void api.hooksPromptDue().then((due) => {
      if (!cancelled && due) {
        setOpen(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [api, hooksOff])

  const answer = async (turnOn: boolean): Promise<void> => {
    setOpen(false)
    await api?.hooksPromptAnswered()
    if (turnOn) {
      await updateSettings({ agentStatusHooksEnabled: true })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && void answer(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {translate('glwork.hooks.confirmTitle', 'Show agent status in GL Work?')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'glwork.hooks.firstAskDescription',
              'With agent status on, GL Work on your phone shows Claude Code and Codex as chats, with their working status and permission prompts. GL Work adds its status hooks to the coding tools’ own settings: ~/.claude/settings.json, ~/.codex/config.toml, ~/.qwen/settings.json and ~/.qoder/settings.json, for the tools you have enabled. You can turn it on or off any time in Settings → Coding tools → Agent status.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void answer(false)}>
            {translate('glwork.hooks.later', 'Not now')}
          </Button>
          <Button type="button" onClick={() => void answer(true)}>
            {translate('glwork.hooks.agree', 'Agree and turn on')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
