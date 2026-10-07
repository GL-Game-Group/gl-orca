import { Building2, TerminalSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { SettingsSection } from '../SettingsSection'
import type { SettingsRenderContext } from '../settings-render-context'
import { GlWorkAccountPane } from './GlWorkAccountPane'
import { GlWorkAgentHooksConsent } from './GlWorkAgentHooksConsent'
import { GlWorkCliTools } from './GlWorkCliTools'

const CLI_TOOLS_SECTION_ID = 'glwork-cli-tools'

function cliToolsTitle(): string {
  return translate('glwork.cli.title', 'Coding tools')
}

function cliToolsDescription(): string {
  return translate(
    'glwork.cli.sectionDescription',
    'Claude Code, Codex and Qoder on this computer: install, sign in, or switch off.'
  )
}

/** Whether this window belongs to GL Work: it then shows the company account where Orca's would be. */
export function isGlWorkClient(): boolean {
  return window.api?.glwork?.isBuild === true
}

function title(): string {
  return translate('glwork.account.title', 'Company account')
}

function description(): string {
  return translate(
    'glwork.account.description',
    'Your GL Work sign-in: company models for your coding tools, and your phone reaching this computer.'
  )
}

/** GL Work's entries in place of Orca Account (same id, so links to 'orca-account' land here), then the coding tools. */
export function glWorkSettingsNavSections(): SettingsNavSection[] {
  return [
    {
      id: 'orca-account',
      title: title(),
      description: description(),
      icon: Building2,
      searchEntries: [{ title: title(), description: description() }],
      group: 'setup'
    },
    {
      id: CLI_TOOLS_SECTION_ID,
      title: cliToolsTitle(),
      description: cliToolsDescription(),
      icon: TerminalSquare,
      searchEntries: [{ title: cliToolsTitle(), description: cliToolsDescription() }],
      group: 'setup'
    }
  ]
}

export function renderGlWorkAccountSettingsSection(
  context: SettingsRenderContext
): React.JSX.Element {
  const { navigation, view } = context
  return (
    <>
      <SettingsSection
        id="orca-account"
        title={title()}
        description={description()}
        searchEntries={navigation.getSectionSearchEntries('orca-account')}
      >
        {view.isSectionMounted('orca-account') ? <GlWorkAccountPane /> : null}
      </SettingsSection>
      <SettingsSection
        id={CLI_TOOLS_SECTION_ID}
        title={cliToolsTitle()}
        description={cliToolsDescription()}
        searchEntries={navigation.getSectionSearchEntries(CLI_TOOLS_SECTION_ID)}
      >
        {view.isSectionMounted(CLI_TOOLS_SECTION_ID) ? (
          <div className="space-y-6">
            <GlWorkCliTools />
            <div className="border-t border-border/60 pt-5">
              <GlWorkAgentHooksConsent />
            </div>
          </div>
        ) : null}
      </SettingsSection>
    </>
  )
}
