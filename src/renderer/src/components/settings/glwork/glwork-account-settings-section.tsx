import { Building2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import { SettingsSection } from '../SettingsSection'
import type { SettingsRenderContext } from '../settings-render-context'
import { GlWorkAccountPane } from './GlWorkAccountPane'

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

/** The navigation entry in place of Orca Account; same id, so links to 'orca-account' land here. */
export function glWorkAccountNavSection(): SettingsNavSection {
  return {
    id: 'orca-account',
    title: title(),
    description: description(),
    icon: Building2,
    searchEntries: [{ title: title(), description: description() }],
    group: 'setup'
  }
}

export function renderGlWorkAccountSettingsSection(
  context: SettingsRenderContext
): React.JSX.Element {
  const { navigation, view } = context
  return (
    <SettingsSection
      id="orca-account"
      title={title()}
      description={description()}
      searchEntries={navigation.getSectionSearchEntries('orca-account')}
    >
      {view.isSectionMounted('orca-account') ? <GlWorkAccountPane /> : null}
    </SettingsSection>
  )
}
