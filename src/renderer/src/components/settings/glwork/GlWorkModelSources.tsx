import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type {
  GlWorkModelSources,
  GlWorkModelSourceTool,
  GlWorkModelVendor
} from '../../../../../shared/glwork-account-types'

const OWN_SIGN_IN = 'own'

const TOOLS: { tool: GlWorkModelSourceTool; protocol: 'anthropic' | 'openai' }[] = [
  { tool: 'claude', protocol: 'anthropic' },
  { tool: 'qwen', protocol: 'openai' }
]

function toolName(tool: GlWorkModelSourceTool): string {
  return tool === 'claude' ? 'Claude Code' : 'Qwen Code'
}

function ownSignInLabel(tool: GlWorkModelSourceTool): string {
  return tool === 'claude'
    ? translate('glwork.account.sourceOwnClaude', 'My own Claude subscription')
    : translate('glwork.account.sourceOwnQwen', 'My own Qwen Code settings')
}

function choiceValue(vendor: string, model: string): string {
  return `${vendor}\n${model}`
}

/** Per CLI: run it on the member's own sign-in, or on one of the company models. */
export function GlWorkModelSources({
  vendors
}: {
  vendors: GlWorkModelVendor[]
}): React.JSX.Element | null {
  const api = window.api.glwork
  const [sources, setSources] = useState<GlWorkModelSources | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api?.modelSources().then(setSources)
  }, [api])

  if (!api || !sources) {
    return null
  }

  const choose = async (tool: GlWorkModelSourceTool, value: string): Promise<void> => {
    const [vendor = '', model = ''] = value.split('\n')
    const result = await api.setModelSource(tool, value === OWN_SIGN_IN ? null : { vendor, model })
    if (result.ok) {
      setSources(result.sources)
      setError(null)
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="space-y-3">
      {TOOLS.map(({ tool, protocol }) => {
        const offered = vendors.filter((vendor) => vendor.protocol === protocol)
        const current = sources[tool]
        return (
          <div key={tool} className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{toolName(tool)}</p>
              <p className="text-xs text-muted-foreground">
                {translate('glwork.account.sourceHint', 'Model source for new sessions')}
              </p>
            </div>
            <Select
              value={current ? choiceValue(current.vendor, current.model) : OWN_SIGN_IN}
              onValueChange={(value) => void choose(tool, value)}
            >
              <SelectTrigger size="sm" className="w-full min-w-52 sm:w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OWN_SIGN_IN}>{ownSignInLabel(tool)}</SelectItem>
                {current &&
                !offered.some(
                  (vendor) =>
                    vendor.vendor === current.vendor &&
                    vendor.models.some((model) => model.id === current.model)
                ) ? (
                  <SelectItem value={choiceValue(current.vendor, current.model)}>
                    {`${current.vendorName} · ${current.modelName}`}
                  </SelectItem>
                ) : null}
                {offered.flatMap((vendor) =>
                  vendor.models.map((model) => (
                    <SelectItem
                      key={choiceValue(vendor.vendor, model.id)}
                      value={choiceValue(vendor.vendor, model.id)}
                    >
                      {`${vendor.name} · ${model.name}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        )
      })}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
